import {identify} from './identity.mjs';
import {listKey} from './crawl-plan.mjs';
export function mergeHistory(history,snapshot,config,overrides={}){
  const next=structuredClone(history||{schemaVersion:1,products:{}});
  if(next.schemaVersion!==1||!next.products)throw new Error('価格履歴の形式が不正です');
  for(const raw of snapshot.offers||[]){
    const shop=config.shops.find(s=>s.id===raw.shopId);if(!shop)continue;
    if(!Number.isSafeInteger(raw.price)||raw.price<=0||!['in','out','unknown'].includes(raw.stock)||!Number.isFinite(Date.parse(raw.observedAt))||Date.parse(raw.observedAt)>Date.now()+60000)throw new Error('価格履歴に不正な観測値があります');
    const url=new URL(raw.url);if(url.origin!==shop.origin)throw new Error('価格履歴のショップURLが一致しません');
    const page=raw.pageUrl||raw.url;
    const sourceSeries=raw.sourceSeries||Object.entries(shop.seriesSeeds||{}).find(([,urls])=>urls.some(u=>listKey(new URL(u,shop.origin).href)===listKey(page)))?.[0];
    const productId=raw.productId||url.pathname.match(/\/(?:shopdetail|product|view\/item)\/(\d+)/)?.[1]||url.pathname;
    const identity=identify({...raw,productId,sourceSeries},shop,page,overrides);if(!identity)continue;
    const id=`${shop.id}:${productId}`,previous=next.products[id];
    const points=new Map((previous?.points||[]).map(p=>[p[0],p]));
    // The source observation time is the key. Cache replay never invents a new sample.
    points.set(raw.observedAt,[raw.observedAt,raw.price,raw.stock]);
    next.products[id]={key:identity.key,number:identity.number,edition:identity.edition,shopId:shop.id,title:raw.title,url:raw.url,points:[...points.values()].sort((a,b)=>Date.parse(a[0])-Date.parse(b[0]))};
  }
  const times=Object.values(next.products).flatMap(p=>p.points.map(x=>Date.parse(x[0])));
  next.firstObservedAt=times.length?new Date(times.reduce((a,b)=>Math.min(a,b),Infinity)).toISOString():null;
  next.lastObservedAt=times.length?new Date(times.reduce((a,b)=>Math.max(a,b),-Infinity)).toISOString():null;
  next.generatedAt=new Date().toISOString();
  return next;
}
