import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export const BOT = 'OPCardCompare';
export async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch(e) { if(e.code === 'ENOENT') return fallback; throw e; } }
export async function atomicJson(file, data) { await mkdir(path.dirname(file), {recursive:true}); await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2)); await rename(`${file}.tmp`, file); }
export function robotsPolicy(body, target, agent = BOT) {
  if (/<html|<!doctype/i.test(body)) throw new Error('robots.txtを確認できません（HTML応答）');
  const groups = []; let g = {agents:[], rules:[], delay:0}, rulesStarted = false;
  for (const line of body.split(/\r?\n/)) {
    const text = line.replace(/#.*/, '').trim(); if(!text) continue;
    const colon = text.indexOf(':'); if(colon < 0) continue;
    const k = text.slice(0,colon).toLowerCase(), v = text.slice(colon+1).trim();
    if(k === 'user-agent') { if(rulesStarted) {groups.push(g); g={agents:[],rules:[],delay:0};rulesStarted=false;} g.agents.push(v.toLowerCase()); }
    else if(g.agents.length && ['allow','disallow','crawl-delay'].includes(k)) {
      rulesStarted=true;
      if(k === 'crawl-delay') g.delay=Math.max(g.delay, Number(v)*1000 || 0);
      else if(v) g.rules.push({allow:k==='allow',path:v});
    }
  }
  if(g.agents.length) groups.push(g);
  const specific = groups.filter(x => x.agents.some(a => a !== '*' && agent.toLowerCase().includes(a)));
  const applicable = specific.length ? specific : groups.filter(x => x.agents.includes('*'));
  let winner = null;
  for(const rule of applicable.flatMap(g=>g.rules)) {
    const exact = rule.path.endsWith('$');
    const source = (exact ? rule.path.slice(0,-1) : rule.path).split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
    if(new RegExp(`^${source}${exact?'$':''}`).test(target)) {
      const len=rule.path.replace(/[*$]/g,'').length;
      if(!winner || len>winner.len || (len===winner.len && rule.allow)) winner={...rule,len};
    }
  }
  return {allowed:winner?.allow ?? true, delay:Math.max(0,...applicable.map(g=>g.delay))};
}
export function retryDelay(value, now) { const seconds=Number(value); return value && Number.isFinite(seconds) ? Math.max(0,seconds*1000) : Math.max(0,(Date.parse(value)||now)-now); }
export class PoliteClient {
  constructor(directory, policy, options={}) {
    this.dir=directory; this.policy=policy; this.fetch=options.fetch || globalThis.fetch;
    this.now=options.now || Date.now; this.sleep=options.sleep || (ms=>new Promise(r=>setTimeout(r,ms)));
    this.state={hosts:{},pages:{}}; this.requests=0;
  }
  async init(){this.state=await readJson(path.join(this.dir,'http.json'),this.state);return this;}
  async save(){await atomicJson(path.join(this.dir,'http.json'),this.state);}
  async get(url, {robots=false,delay=0}={}) {
    const u=new URL(url); if(u.protocol!=='https:') throw new Error('HTTPSのみ対応');
    const key=createHash('sha256').update(url).digest('hex');
    const previous=this.state.pages[url];
    const cached=previous ? await readJson(path.join(this.dir,`${key}.json`),null) : null;
    const ttl=Math.max(12,this.policy.cacheTtlHours)*3600000;
    if(cached && this.now()-previous.checkedAt<ttl) return {...cached,cacheHit:true,checkedAt:previous.checkedAt};
    const host=this.state.hosts[u.origin] ||= {windowStart:this.now(),count:0,last:0,cooldown:0};
    if(host.cooldown>this.now()) throw new Error(`取得休止中（${new Date(host.cooldown).toISOString()}まで）`);
    if(this.now()-host.windowStart>=86400000) {host.windowStart=this.now();host.count=0;}
    if(host.count>=Math.min(20,this.policy.maxRequestsPerShopPerDay)) throw new Error('24時間のアクセス上限に達しました');
    const wait=Math.max(0,host.last+Math.max(10000,this.policy.minIntervalMs,delay)-this.now());
    if(wait) await this.sleep(wait + Math.floor(Math.random()*1000));
    host.last=this.now(); host.count++; this.requests++; await this.save(); // Reserve budget before network, including failed requests.
    const headers={'User-Agent':`${BOT}/1.0 (low-frequency retail-price comparison)`,Accept:robots?'text/plain':'text/html'};
    if(previous?.etag) headers['If-None-Match']=previous.etag;
    if(previous?.modified) headers['If-Modified-Since']=previous.modified;
    let response;
    try {response=await this.fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(this.policy.timeoutMs)});}
    catch(e){host.cooldown=this.now()+6*3600000;await this.save();throw new Error(`通信失敗、6時間停止: ${e.message}`);}
    if(response.status===304 && cached) {previous.checkedAt=this.now();await this.save();return {...cached,checkedAt:previous.checkedAt,cacheHit:true};}
    if([403,429,503].includes(response.status)) {
      host.cooldown=this.now()+Math.max(86400000,retryDelay(response.headers.get('retry-after'),this.now()));await this.save();
      throw new Error(`HTTP ${response.status}: 再試行せず24時間以上停止`);
    }
    if(response.status>=300 && response.status<400) throw new Error(`転送先の事前確認が必要: ${response.headers.get('location')}`);
    if(!response.ok && !(robots && [404,410].includes(response.status))) {
      host.cooldown=this.now()+6*3600000;await this.save();throw new Error(`HTTP ${response.status}: 6時間停止`);
    }
    let total=0;const chunks=[];
    for await(const chunk of response.body || []) {total+=chunk.length;if(total>6*1024*1024){await this.stop(u.origin);throw new Error('応答サイズ上限');}chunks.push(chunk);}
    const bytes=Buffer.concat(chunks), head=bytes.subarray(0,2048).toString('ascii');
    const charset=response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || head.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
    const body=robots && [404,410].includes(response.status) ? '' : new TextDecoder(charset).decode(bytes);
    if(/安全な接続を確認|Just a moment|cf-chl-|captcha/i.test(body)) {await this.stop(u.origin);throw new Error('接続確認画面を検出、24時間停止');}
    const result={body,status:response.status,url,checkedAt:this.now()};
    this.state.pages[url]={checkedAt:this.now(),etag:response.headers.get('etag'),modified:response.headers.get('last-modified')};
    await atomicJson(path.join(this.dir,`${key}.json`),result); await this.save(); return result;
  }
  async stop(origin){(this.state.hosts[origin] ||= {}).cooldown=this.now()+86400000;await this.save();}
  async page(url) {
    const u=new URL(url), robot=await this.get(`${u.origin}/robots.txt`,{robots:true});
    const policy=robotsPolicy(robot.body,`${u.pathname}${u.search}`);
    if(!policy.allowed) throw new Error('robots.txtにより取得対象外');
    return this.get(url,{delay:policy.delay});
  }
}
