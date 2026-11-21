export const normalise = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s・･]/g,'').replace(/[‐‑–—ー]/g,'-');
export function isFresh(offer, policy, now=Date.now()) {const t=Date.parse(offer.observedAt);return Number.isFinite(t) && t<=now+60000 && now-t<=policy.staleAfterHours*3600000;}
export function bestOffers(offers, policy, {now=Date.now(),includeStale=false}={}) {
  const map=new Map();
  for(const o of offers) {
    if(o.stock!=='in' || (!includeStale && !isFresh(o,policy,now))) continue;
    const old=map.get(o.shopId);
    if(!old || o.price<old.price || (o.price===old.price && o.observedAt>old.observedAt)) map.set(o.shopId,o);
  }
  return [...map.values()].sort((a,b)=>a.price-b.price);
}
export function groupOffers(data,catalog={}) {
  const map=new Map();
  for(const o of data.offers) {
    if(!map.has(o.key)) map.set(o.key,{key:o.key,number:o.number,name:o.verified?(catalog[o.number]?.name||o.title):o.title,meta:catalog[o.number]||{},variant:o.variant,verified:o.verified,label:o.label,edition:o.edition,offers:[]});
    map.get(o.key).offers.push(o);
  }
  return [...map.values()];
}
export function validateSnapshot(data) {
  if(data?.schemaVersion!==1 || !Array.isArray(data.shops)||!Array.isArray(data.offers)||data.offers.length>100000 || !data.policy || !(data.policy.staleAfterHours>0 && data.policy.staleAfterHours<=168)) throw new Error('価格データの形式が違います');
  const ids=new Set();
  for(const s of data.shops) {const u=new URL(s.origin);if(!/^[a-z][\w-]{0,40}$/.test(s.id)||ids.has(s.id)||u.protocol!=='https:'||u.origin!==s.origin||!s.name)throw new Error('ショップ設定が不正です');ids.add(s.id);}
  for(const o of data.offers) {const s=data.shops.find(s=>s.id===o.shopId);if(!s||!o.key||!o.id||!o.title||!o.number||!Number.isSafeInteger(o.price)||o.price<=0||!['in','out','unknown'].includes(o.stock)||!Number.isFinite(Date.parse(o.observedAt))||Date.parse(o.observedAt)>Date.now()+60000||new URL(o.url).origin!==s.origin)throw new Error('商品データが不正です');}
  return data;
}
