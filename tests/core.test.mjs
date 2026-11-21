import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {robotsPolicy,PoliteClient,retryDelay} from '../scripts/lib/http.mjs';
import {parsePage} from '../scripts/lib/adapters.mjs';
import {identify} from '../scripts/lib/identity.mjs';
import {bestOffers,isFresh,validateSnapshot,groupOffers} from '../public/compare.js';
const shop={id:'testshop',origin:'https://example.com',adapter:'cart'};
test('robots: grouped agents, wildcards, allow precedence and crawl delay',()=>{
  const robots='User-agent: Other\nDisallow: /\nUser-agent: *\nDisallow: /private\nDisallow: /*.csv$\nAllow: /private/public\nCrawl-delay: 25';
  assert.equal(robotsPolicy(robots,'/product-list').allowed,true);
  assert.equal(robotsPolicy(robots,'/private/data').allowed,false);
  assert.equal(robotsPolicy(robots,'/private/public').allowed,true);
  assert.equal(robotsPolicy(robots,'/prices.csv').allowed,false);
  assert.equal(robotsPolicy(robots,'/prices.csv?x=1').allowed,true);
  assert.equal(robotsPolicy(robots,'/').delay,25000);
  assert.equal(robotsPolicy('User-agent: OPCardCompare\nDisallow: /\nUser-agent: *\nAllow: /','/').allowed,false);
  assert.throws(()=>robotsPolicy('<html>verification</html>','/'));
});
test('304 revalidation reuses content and timestamp; persistent cache avoids requests',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'op-compare-test-'));
  let now=Date.now(),calls=0;
  const policy={cacheTtlHours:12,minIntervalMs:10000,maxRequestsPerShopPerDay:20,timeoutMs:1000};
  const c=await new PoliteClient(dir,policy,{now:()=>now,sleep:async ms=>{now+=ms;},fetch:async(_url,opt)=>{
    calls++;if(calls===1)return new Response('content',{headers:{etag:'abc'}});
    assert.equal(opt.headers['If-None-Match'],'abc');return new Response(null,{status:304});
  }}).init();
  const first=await c.get('https://example.com/list');assert.equal(first.body,'content');
  now+=1000;assert.equal((await c.get('https://example.com/list')).cacheHit,true);assert.equal(calls,1);
  now+=13*3600000;const next=await c.get('https://example.com/list');assert.equal(next.body,'content');assert.ok(next.checkedAt>first.checkedAt);assert.equal(calls,2);
  const reloaded=await new PoliteClient(dir,policy,{now:()=>now,fetch:()=>assert.fail('cache should avoid all network')}).init();
  assert.equal((await reloaded.get('https://example.com/list')).body,'content');
});
test('429 honors Retry-After and persists circuit breaker without retries',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'op-compare-test-'));let now=Date.now(),calls=0;
  const c=await new PoliteClient(dir,{cacheTtlHours:12,minIntervalMs:10000,maxRequestsPerShopPerDay:20,timeoutMs:1000},{now:()=>now,fetch:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'172800'}});}}).init();
  await assert.rejects(c.get('https://example.com/a'),/429/);await assert.rejects(c.get('https://example.com/b'),/取得休止/);assert.equal(calls,1);assert.ok(c.state.hosts['https://example.com'].cooldown>=now+172800000);
  assert.equal(retryDelay(new Date(now+60000).toUTCString(),now)>59000,true);
});
test('daily budget and minimum interval include robots request',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'op-compare-test-'));let now=Date.now();const starts=[];
  const c=await new PoliteClient(dir,{cacheTtlHours:12,minIntervalMs:10000,maxRequestsPerShopPerDay:2,timeoutMs:1000},{now:()=>now,sleep:async ms=>{now+=ms;},fetch:async url=>{starts.push(now);return new Response(url.endsWith('/robots.txt')?'User-agent: *\nCrawl-delay: 12':'<html>ok</html>');}}).init();
  await c.page('https://example.com/a');assert.equal(starts.length,2);assert.ok(starts[1]-starts[0]>=12000);
  await assert.rejects(c.page('https://example.com/b'),/上限/);assert.equal(starts.length,2);
});
test('robots disallow prevents product fetch; redirects never silently follow',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'op-compare-test-'));let count=0;
  const c=await new PoliteClient(dir,{cacheTtlHours:12,minIntervalMs:10000,maxRequestsPerShopPerDay:20,timeoutMs:1000},{fetch:async()=>{count++;return new Response('User-agent: *\nDisallow: /');}}).init();
  await assert.rejects(c.page('https://example.com/list'),/robots.txt/);assert.equal(count,1);
  const d=await new PoliteClient(await mkdtemp(path.join(os.tmpdir(),'op-compare-test-')),{cacheTtlHours:12,minIntervalMs:10000,maxRequestsPerShopPerDay:20,timeoutMs:1000},{fetch:async()=>new Response(null,{status:302,headers:{location:'https://other.example/'}})}).init();
  await assert.rejects(d.get('https://example.com/list'),/転送先/);
});
test('normal cards group across shops, parallels and ambiguous reprints stay isolated',()=>{
  const normal={title:'モンキー・D・ルフィ【SR】{OP17-093}',model:'',url:'https://example.com/product/1'};
  const a=identify(normal,shop,shop.origin);assert.equal(a.key,'OP17-093:normal:ja:standard');assert.equal(a.verified,true);
  for(const title of ['モンキー・D・ルフィ(パラレル)【SR/P】{OP17-093}','状態A- ルフィ OP17-093','【英語版】ルフィ OP17-093','ルフィ OP17-093【OP18】','ルフィ OP17-093 金文字','ルフィ OP17-093 (illust:Test)'])assert.equal(identify({...normal,title},shop,shop.origin).verified,false,title);
  assert.equal(identify(normal,shop,'https://example.com/s/op18').verified,false);
  assert.equal(identify({...normal,title:'PSA10 OP17-093'},shop,shop.origin),null);
});
test('cart parser keeps out-of-stock/unknown distinct; rejects non-card goods',()=>{
  const item=(id,title,stock,price=100)=>`<li class="list_item_cell"><a href="https://example.com/product/${id}"><span class="goods_name">${title}</span><p class="selling_price"><span class="figure">${price}<span>円</span></span>(税込)</p><p class="stock">${stock}</p></a></li>`;
  const p=parsePage(shop,item(1,'ルフィ OP17-093','在庫数 5枚')+item(2,'ルフィ OP17-093','SOLD OUT')+item(3,'ルフィ OP17-093','')+item(4,'スリーブ','在庫数 1個'),'https://example.com/product-list');
  assert.deepEqual(p.offers.map(o=>o.stock),['in','out','unknown']);assert.equal(p.offers[0].price,100);
});
test('fresh in-stock only qualifies as best, excluding stale/unknown/soldout prices',()=>{
  const now=Date.now(),policy={staleAfterHours:36};
  const offer=(id,price,stock,hours)=>({shopId:id,price,stock,observedAt:new Date(now-hours*3600000).toISOString()});
  const offers=[offer('a',100,'in',1),offer('b',50,'out',1),offer('c',30,'in',40),offer('d',20,'unknown',1),offer('a',150,'in',1)];
  assert.deepEqual(bestOffers(offers,policy,{now}).map(x=>x.price),[100]);assert.equal(isFresh(offers[2],policy,now),false);
});
test('actual collected snapshot validates, has seven shops and real multi-shop normal comparisons',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url),'utf8'));validateSnapshot(data);
  assert.ok(new Set(data.offers.map(o=>o.shopId)).size>=7);
  const groups=groupOffers(data);assert.ok(groups.some(g=>g.verified&&new Set(g.offers.map(o=>o.shopId)).size>=3));
  assert.ok(data.offers.every(o=>o.price>0&&o.url.startsWith('https://')));
  const invalid=structuredClone(data);invalid.offers[0].url='javascript:alert(1)';assert.throws(()=>validateSnapshot(invalid));
});
