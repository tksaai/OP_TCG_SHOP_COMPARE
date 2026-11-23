import {clean,parsePage} from './adapters.mjs';
import {canonicalPage,listKey,pageNumber} from './crawl-plan.mjs';
const serials=label=>[...new Set([...clean(label).normalize('NFKC').matchAll(/\b(OP|EB|PRB|ST)[-\s]?(\d{1,2})(?!\d)/gi)].map(m=>m[1].toUpperCase()+m[2].padStart(2,'0')))];
export function discoverSeries(shop,documents){
  const result={};
  const add=(label,href)=>{
    const codes=serials(label);if(codes.length!==1)return;
    try{const u=new URL(href,shop.origin);if(u.origin!==shop.origin)return;
      if(!/^(?:\/product-(?:list|group)(?:\/|$)|\/products\/list$|\/shop\/c\/c\d+\/|\/shopbrand\/|\/view\/category\/|\/sell\/opc\/s\/)/.test(u.pathname))return;
      (result[codes[0]] ||= new Set()).add(canonicalPage(u.href));
    }catch{}
  };
  for(const html of documents){
    for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))add(m[2],clean(m[1]));
    for(const m of html.matchAll(/globalObj\.(productCategoryNameList|productGroupNameList)\s*=\s*(\[[^\n]*\]);/g)){
      try{const walk=items=>{for(const x of items){if(x.id)add(x.name,`/product-${m[1]==='productCategoryNameList'?'list':'group'}/${x.id}`);if(Array.isArray(x.sub))walk(x.sub);}};walk(JSON.parse(m[2]));}catch{}
    }
  }
  for(const [code,urls]of Object.entries(shop.seriesSeeds||{}))for(const url of urls)(result[code] ||= new Set()).add(canonicalPage(new URL(url,shop.origin).href));
  // Some stores show only the product title in navigation, but the configured URL
  // itself contains a documented, unambiguous series code. Opaque numeric IDs do not.
  for(const seed of shop.seeds){
    const url=new URL(seed,shop.origin);
    const code=(url.pathname.match(/^\/sell\/opc\/s\/((?:op|eb|st|prb)\d{2})\/?$/i)?.[1]||url.pathname.match(/^\/(?:shopbrand|view\/category)\/opc-((?:op|eb|st|prb)\d{2})\/?$/i)?.[1])?.toUpperCase();
    if(code)(result[code] ||= new Set()).add(canonicalPage(url.href));
  }
  return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,[...v]]));
}
const numberOf=pageNumber;
export function auditList(shop,root,pages,htmlByUrl){
  const key=listKey(root),saved=Object.entries(pages).filter(([url,p])=>p.shopId===shop.id&&listKey(url)===key);
  const errors=[],known=new Set([1]),fetched=new Set(saved.map(([url])=>numberOf(url)));
  let oldest=null;
  for(const [url,page]of saved){
    if(!page.observedAt||!Number.isFinite(Date.parse(page.observedAt)))errors.push(`確認日時が不正: ${url}`);
    else oldest=Math.min(oldest??Infinity,Date.parse(page.observedAt));
    const html=htmlByUrl[url]||htmlByUrl[canonicalPage(url)];
    if(!html){errors.push(`保存HTMLなし: ${url}`);continue;}
    try{const parsed=parsePage(shop,html,url);if(!parsed.offers.length)errors.push(`商品0件: ${url}`);for(const next of parsed.nextPages)if(listKey(next)===key)known.add(numberOf(next));}catch(e){errors.push(e.message);}
  }
  const max=Math.max(...known,...fetched),missing=[];
  if(max>10000)errors.push('異常なページ数');
  else for(let i=1;i<=max;i++)if(!fetched.has(i))missing.push(i);
  return {root,knownPageCount:max,savedPageCount:fetched.size,missingPages:missing,errors,oldestObservedAt:oldest?new Date(oldest).toISOString():null,knownPagesComplete:saved.length>0&&!missing.length&&!errors.length};
}
export function auditCoverage({config,catalog,pages,htmlByUrl,snapshot,now=Date.now()}){
  const series=catalog.series,rows=[];
  for(const shop of config.shops){
    const docs=Object.entries(htmlByUrl).filter(([u])=>new URL(u).origin===shop.origin).map(([,h])=>h);
    const discovered=discoverSeries(shop,docs);
    const seeds=shop.seeds.map(s=>canonicalPage(new URL(s,shop.origin).href));
    for(const item of series){
      const known=discovered[item.id]||[];
      const roots=seeds.filter(seed=>known.some(u=>listKey(u)===listKey(seed)));
      const lists=roots.map(root=>auditList(shop,root,pages,htmlByUrl));
      const offers=snapshot.offers.filter(o=>o.shopId===shop.id&&o.edition===item.id);
      let status=!shop.enabled?'paused':!roots.length?'not_configured':lists.every(l=>l.savedPageCount===0)?'not_collected':lists.every(l=>l.knownPagesComplete)?'known_pages_covered':'partial';
      const fresh=lists.length>0&&lists.every(l=>l.oldestObservedAt&&now-Date.parse(l.oldestObservedAt)<=config.policy.staleAfterHours*3600000);
      rows.push({series:item.id,shopId:shop.id,shopName:shop.name,status,fresh,offerCount:offers.length,cardNumbers:new Set(offers.map(o=>o.number)).size,registeredRoots:roots,discoveredRoots:known,lists});
    }
  }
  const enabled=config.shops.filter(s=>s.enabled).length,bySeries=series.map(s=>({id:s.id,label:s.label,registeredShops:rows.filter(r=>r.series===s.id&&r.registeredRoots.length).length,knownPagesCoveredShops:rows.filter(r=>r.series===s.id&&r.status==='known_pages_covered').length,offers:rows.filter(r=>r.series===s.id).reduce((n,r)=>n+r.offerCount,0)}));
  return {schemaVersion:1,generatedAt:new Date(now).toISOString(),snapshotGeneratedAt:snapshot.generatedAt,scope:catalog.scope,catalogSource:catalog.source,notes:['全カード・全パラレルの在庫網羅を保証するものではありません。','known_pages_coveredは登録した一覧の保存HTMLで確認できたページ範囲です。','総合一覧で少数の商品が見つかっただけでは、その弾を取得済みと判定しません。'],summary:{seriesCount:series.length,shops:config.shops.length,enabledShops:enabled,pausedShops:config.shops.length-enabled,seriesCoveredAtAnyShop:bySeries.filter(s=>s.knownPagesCoveredShops>0).length,seriesCoveredAtAllEnabledShops:bySeries.filter(s=>s.knownPagesCoveredShops===enabled).length,unconfiguredSeries:bySeries.filter(s=>s.registeredShops===0).map(s=>s.id),allSeriesCheckPassed:rows.every(r=>r.status==='known_pages_covered'&&r.fresh)},series:bySeries,rows};
}
