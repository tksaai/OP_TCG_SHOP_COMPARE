import {CARD_NUMBER,cardLookup} from '../../public/shop-search.js';
import {canonicalPage} from './crawl-plan.mjs';
export function parseRequestedCards(value){
  const cards=[...new Set(String(value||'').toUpperCase().split(/[\s,、]+/).filter(Boolean))];
  if(cards.length>20 || cards.some(n=>!CARD_NUMBER.test(n)))throw new Error('優先カードは正しい型番を20種類以下で指定してください');
  return cards;
}
export function lookupTargets(shop,cards){return [...new Set(cards.map(n=>cardLookup(shop,n)?.url).filter(Boolean).map(canonicalPage))];}
export function promoteLookups(queue,targets){
  // Keep the existing rotation, but visit each bounded watch-list search first.
  return [...new Set([...targets,...queue])];
}
export function lookupReport(config,cards,pages,offers){
  return cards.flatMap(number=>config.shops.map(shop=>{
    const target=cardLookup(shop,number),page=target&&pages[canonicalPage(target.url)];
    const found=offers.filter(o=>o.shopId===shop.id&&o.number===number);
    return {number,shopId:shop.id,url:target?.url||null,kind:target?.kind||null,
      status:!shop.enabled?'paused':found.length?'found':page?.searchEmpty?'not_found':page?.observedAt?'not_in_saved_pages':'pending',
      count:found.length,soldOutCount:found.filter(o=>o.stock==='out').length,observedAt:page?.observedAt||null};
  }));
}
