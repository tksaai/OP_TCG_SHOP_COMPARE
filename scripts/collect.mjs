import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PoliteClient,readJson,atomicJson} from './lib/http.mjs';
import {parsePage} from './lib/adapters.mjs';
import {identify} from './lib/identity.mjs';
import {mergeQueue,nextPage,addDiscovered} from './lib/crawl-plan.mjs';
import {mergeHistory} from './lib/price-history.mjs';
import {audit} from './audit-coverage.mjs';
import {lookupTargets,promoteLookups,parseRequestedCards,lookupReport} from './lib/card-lookup.mjs';
import {nextCatalogLookup} from './lib/catalog-lookup.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function collect({only=null,maxPages=null,series=null,reparseOnly=false}={}) {
  const automation=await readJson(path.join(ROOT,'config/automation.json'),{});
  if(automation.collector==='github-actions' && process.env.GITHUB_ACTIONS!=='true' && !reparseOnly)throw new Error('収集元はGitHub Actionsに移行しました。update-prices.bat またはActionsのRun workflowで実行してください（複数環境からの重複収集を防止）');
  const dir=path.join(ROOT,'.cache');await mkdir(dir,{recursive:true});
  let lock;
  try {lock=await open(path.join(dir,'collect.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));}
  catch(e) {if(e.code==='EEXIST') throw new Error('収集処理はすでに実行中です。異常終了時はREADMEのロック解除手順を参照してください。');throw e;}
  try {
    const config=await readJson(path.join(ROOT,'config/shops.json'),null);
    const requested=parseRequestedCards(process.env.LOOKUP_CARDS);
    const watchCards=requested.length?requested:(config.watchCards||[]);
    const catalog=await readJson(path.join(ROOT,'public/data/catalog.json'),{});
    if(series && !config.shops.some(s=>s.seriesSeeds?.[series]?.length))throw new Error(`未登録の収録シリーズ: ${series}`);
    const overrides=await readJson(path.join(ROOT,'config/identity-overrides.json'),{});
    const pages=await readJson(path.join(dir,'collected-pages.json'),{});
    const queues=await readJson(path.join(dir,'queues.json'),{});
    const previous=await readJson(path.join(ROOT,'public/data/prices.json'),{offers:[],shops:[]});
    const client=await new PoliteClient(path.join(dir,'http'),config.policy).init();
    const statuses=new Map(previous.shops.map(s=>[s.id,s]));
    if(reparseOnly){
      for(const [url,page] of Object.entries(pages)){
        const shop=config.shops.find(s=>s.id===page.shopId);if(!shop?.enabled)continue;
        const cached=await readJson(path.join(dir,'http',`${createHash('sha256').update(url).digest('hex')}.json`),null);
        if(!cached)throw new Error(`再解析用HTMLがありません: ${url}`);
        const parsed=parsePage(shop,cached.body,url);
        if(!parsed.offers.length)throw new Error(`再解析で商品が0件になりました: ${url}`);
        page.offers=parsed.offers; // Retain original observedAt, including failures/stale pages.
      }
      await atomicJson(path.join(dir,'collected-pages.json'),pages);
    }
    for(const shop of config.shops) {
      if(reparseOnly)continue;
      if(only && shop.id!==only) continue;
      if(!shop.enabled) {statuses.set(shop.id,{...shop,status:'paused',message:shop.note});continue;}
      if(series && !shop.seriesSeeds?.[series]?.length)continue;
      const targets=lookupTargets(shop,watchCards).sort((a,b)=>(client.state.pages[a]?.checkedAt||0)-(client.state.pages[b]?.checkedAt||0));
      const catalogTarget=!series&&!requested.length?nextCatalogLookup(shop,catalog,client.state.pages,targets):null;
      // Preserve the first two priority searches and reserve one existing slot for the DB.
      if(catalogTarget){targets.splice(Math.min(2,targets.length),0,catalogTarget.url);console.log(`${shop.name}: DB巡回対象 ${catalogTarget.number}`);}
      const seeds=[...targets,...shop.seeds.map(s=>new URL(s,shop.origin).href)];
      const queue=queues[shop.id]=promoteLookups(mergeQueue(queues[shop.id]||[],seeds),targets);
      const roots=series?shop.seriesSeeds[series].map(s=>new URL(s,shop.origin).href):null;
      const visited=new Set();
      let read=0,errors=[],freshest=null;
      const limit=Math.min(maxPages || config.policy.maxPagesPerShopPerRun,config.policy.maxPagesPerShopPerRun);
      for(let i=0;i<limit;i++) {
        const url=nextPage(queue,visited,roots||(i<Math.min(catalogTarget?3:2,targets.length)?[targets[i]]:null));if(!url)break;
        if(new URL(url).origin!==shop.origin) {errors.push('設定外のドメインを拒否');continue;}
        try {
          const result=await client.page(url);
          if(process.env.CAPTURE_LOOKUP==='true' && targets.includes(url))await atomicJson(path.join(dir,'lookup-debug',`${shop.id}-${createHash('sha256').update(url).digest('hex').slice(0,12)}.json`),result);
          const parsed=parsePage(shop,result.body,url);
          const searchEmpty=targets.includes(url)&&Boolean(shop.cardSearch)&&!parsed.offers.length&&/該当する商品(?:は|が)(?:見つかりません|ありません)|検索結果[\s\S]{0,80}(?:0件|0 件)|商品が見つかりません/.test(result.body);
          if(!parsed.offers.length&&!searchEmpty) throw new Error('商品を検出できないため前回データを保持');
          if(!searchEmpty && pages[url]?.offers.length>=20 && parsed.offers.length<pages[url].offers.length*0.5) throw new Error('取得件数が半分未満になったため前回データを保持');
          pages[url]={shopId:shop.id,observedAt:new Date(result.checkedAt).toISOString(),offers:parsed.offers,...(searchEmpty?{searchEmpty:true}:{})};read++;
          freshest=Math.max(freshest||0,result.checkedAt);
          addDiscovered(queue,parsed.nextPages);
          console.log(`${shop.name}: ${parsed.offers.length}件 ${result.cacheHit?'キャッシュ':'取得'} ${url}`);
        } catch(e) {
          errors.push(e.message);console.warn(`${shop.name}: ${e.message}`);
          const host=client.state.hosts[shop.origin];
          if(host?.cooldown>Date.now() || /アクセス上限|robots|転送先/.test(e.message))break;
          // A malformed/empty listing must not prevent checking the other card.
        }
      }
      statuses.set(shop.id,{...shop,status:errors.length?'partial':'active',message:errors.join(' / ') || shop.note,lastCheckedAt:freshest?new Date(freshest).toISOString():statuses.get(shop.id)?.lastCheckedAt||null,pagesRead:read,queuedPages:queue.length});
      await atomicJson(path.join(dir,'collected-pages.json'),pages);await atomicJson(path.join(dir,'queues.json'),queues);
    }
    const offers=new Map();
    for(const [pageUrl,page] of Object.entries(pages)) {
      const shop=config.shops.find(s=>s.id===page.shopId);if(!shop?.enabled) continue;
      for(const raw of page.offers) {
        const identity=identify(raw,shop,pageUrl,overrides);if(!identity)continue;
        const id=`${shop.id}:${raw.productId||new URL(raw.url).pathname}`;
        const offer={...raw,...identity,id,shopId:shop.id,pageUrl,observedAt:page.observedAt};
        if(!offers.has(id)||offers.get(id).observedAt<offer.observedAt)offers.set(id,offer);
      }
    }
    // Explicit manual files use the same schema. No untrusted arbitrary URL is fetched.
    const manual=await readJson(path.join(ROOT,'config/manual-offers.json'),[]);
    for(const raw of manual){const shop=config.shops.find(s=>s.id===raw.shopId);if(!shop || !Number.isInteger(raw.price)||raw.price<=0||!['in','out','unknown'].includes(raw.stock)||!Number.isFinite(Date.parse(raw.observedAt))||Date.parse(raw.observedAt)>Date.now()+60000||new URL(raw.url).origin!==shop.origin)throw new Error('手動価格データが不正です');const idn=identify(raw,shop,raw.url,overrides);if(idn)offers.set(`manual:${shop.id}:${raw.url}`,{...raw,...idn,id:`manual:${shop.id}:${raw.url}`,manual:true});}
    const snapshot={schemaVersion:1,generatedAt:new Date().toISOString(),policy:config.policy,scope:'型番検索・収録弾別・総合一覧の取得済み価格を比較。売り切れも保存。全在庫の網羅ではありません。',watchCards,lookupStatus:lookupReport(config,watchCards,pages,[...offers.values()]),shops:config.shops.map(s=>({...statuses.get(s.id),...s,count:[...offers.values()].filter(o=>o.shopId===s.id).length})),offers:[...offers.values()]};
    const historyPath=path.join(ROOT,'public/data/history.json');
    let history=await readJson(historyPath,null);
    history=mergeHistory(history,previous,config,overrides);
    history=mergeHistory(history,snapshot,config,overrides);
    await atomicJson(historyPath,history);
    await atomicJson(path.join(ROOT,'public/data/prices.json'),snapshot);
    await audit({quiet:true});
    console.log(`保存: ${snapshot.offers.length}商品 / 今回のHTTP要求 ${client.requests}回`);
    return snapshot;
  } finally {await lock.close();await unlink(path.join(dir,'collect.lock'));}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const arg=(key)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.split('=')[1];
  collect({only:arg('shop'),maxPages:Number(arg('pages'))||null,series:arg('series')?.toUpperCase()||null,reparseOnly:process.argv.includes('--reparse')}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
