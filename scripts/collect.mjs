import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PoliteClient,readJson,atomicJson} from './lib/http.mjs';
import {parsePage} from './lib/adapters.mjs';
import {identify} from './lib/identity.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function collect({only=null,maxPages=null}={}) {
  const dir=path.join(ROOT,'.cache');await mkdir(dir,{recursive:true});
  let lock;
  try {lock=await open(path.join(dir,'collect.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));}
  catch(e) {if(e.code==='EEXIST') throw new Error('収集処理はすでに実行中です。異常終了時はREADMEのロック解除手順を参照してください。');throw e;}
  try {
    const config=await readJson(path.join(ROOT,'config/shops.json'),null);
    const overrides=await readJson(path.join(ROOT,'config/identity-overrides.json'),{});
    const pages=await readJson(path.join(dir,'collected-pages.json'),{});
    const queues=await readJson(path.join(dir,'queues.json'),{});
    const previous=await readJson(path.join(ROOT,'public/data/prices.json'),{offers:[],shops:[]});
    const client=await new PoliteClient(path.join(dir,'http'),config.policy).init();
    const statuses=new Map(previous.shops.map(s=>[s.id,s]));
    for(const shop of config.shops) {
      if(only && shop.id!==only) continue;
      if(!shop.enabled) {statuses.set(shop.id,{...shop,status:'paused',message:shop.note});continue;}
      const seeds=shop.seeds.map(s=>new URL(s,shop.origin).href);
      const queue=queues[shop.id] ||= [...seeds];
      for(const seed of seeds) if(!queue.includes(seed)) queue.push(seed);
      let read=0,errors=[],freshest=null;
      const limit=Math.min(maxPages || config.policy.maxPagesPerShopPerRun,config.policy.maxPagesPerShopPerRun,queue.length);
      for(let i=0;i<limit;i++) {
        const url=queue.shift();queue.push(url);
        if(new URL(url).origin!==shop.origin) {errors.push('設定外のドメインを拒否');continue;}
        try {
          const result=await client.page(url);
          const parsed=parsePage(shop,result.body,url);
          if(!parsed.offers.length) throw new Error('商品を検出できないため前回データを保持');
          if(pages[url]?.offers.length>=20 && parsed.offers.length<pages[url].offers.length*0.5) throw new Error('取得件数が半分未満になったため前回データを保持');
          pages[url]={shopId:shop.id,observedAt:new Date(result.checkedAt).toISOString(),offers:parsed.offers};read++;
          freshest=Math.max(freshest||0,result.checkedAt);
          for(const next of parsed.nextPages) if(!queue.includes(next)) queue.push(next);
          console.log(`${shop.name}: ${parsed.offers.length}件 ${result.cacheHit?'キャッシュ':'取得'} ${url}`);
        } catch(e) {errors.push(e.message);console.warn(`${shop.name}: ${e.message}`);break;}
      }
      statuses.set(shop.id,{...shop,status:errors.length?'partial':'active',message:errors.join(' / ') || shop.note,lastCheckedAt:freshest?new Date(freshest).toISOString():statuses.get(shop.id)?.lastCheckedAt||null,pagesRead:read,queuedPages:queue.length});
      await atomicJson(path.join(dir,'collected-pages.json'),pages);await atomicJson(path.join(dir,'queues.json'),queues);
    }
    const offers=new Map();
    for(const [pageUrl,page] of Object.entries(pages)) {
      const shop=config.shops.find(s=>s.id===page.shopId);if(!shop?.enabled) continue;
      for(const raw of page.offers) {
        const identity=identify(raw,shop,pageUrl,overrides);if(!identity)continue;
        const id=`${shop.id}:${new URL(raw.url).pathname}`;
        const offer={...raw,...identity,id,shopId:shop.id,pageUrl,observedAt:page.observedAt};
        if(!offers.has(id)||offers.get(id).observedAt<offer.observedAt)offers.set(id,offer);
      }
    }
    // Explicit manual files use the same schema. No untrusted arbitrary URL is fetched.
    const manual=await readJson(path.join(ROOT,'config/manual-offers.json'),[]);
    for(const raw of manual){const shop=config.shops.find(s=>s.id===raw.shopId);if(!shop || !Number.isInteger(raw.price)||raw.price<=0||!['in','out','unknown'].includes(raw.stock)||!Number.isFinite(Date.parse(raw.observedAt))||Date.parse(raw.observedAt)>Date.now()+60000||new URL(raw.url).origin!==shop.origin)throw new Error('手動価格データが不正です');const idn=identify(raw,shop,raw.url,overrides);if(idn)offers.set(`manual:${shop.id}:${raw.url}`,{...raw,...idn,id:`manual:${shop.id}:${raw.url}`,manual:true});}
    const snapshot={schemaVersion:1,generatedAt:new Date().toISOString(),policy:config.policy,scope:'収集済みの商品一覧のみ。全在庫の網羅ではありません。',shops:config.shops.map(s=>({...s,...statuses.get(s.id),count:[...offers.values()].filter(o=>o.shopId===s.id).length})),offers:[...offers.values()]};
    await atomicJson(path.join(ROOT,'public/data/prices.json'),snapshot);
    console.log(`保存: ${snapshot.offers.length}商品 / 今回のHTTP要求 ${client.requests}回`);
    return snapshot;
  } finally {await lock.close();await unlink(path.join(dir,'collect.lock'));}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const arg=(key)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.split('=')[1];
  collect({only:arg('shop'),maxPages:Number(arg('pages'))||null}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
