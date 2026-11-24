import {cardLookup} from '../../public/shop-search.js';
import {canonicalPage} from './crawl-plan.mjs';
// One DB target per run; rotate families and then series by last observation.
// This only chooses a URL. PoliteClient still enforces every host's shared limits.
export function nextCatalogLookup(shop,catalog,pageState={},excluded=[]){
  const skip=new Set(excluded.map(canonicalPage)),families=new Map();
  for(const [number,card] of Object.entries(catalog)){
    if(!card.db)continue;
    const lookup=cardLookup(shop,number);if(!lookup)continue;
    const url=canonicalPage(lookup.url);if(skip.has(url))continue;
    const edition=number.split('-')[0],family=edition.replace(/\d/g,'');
    const checked=Number(pageState[url]?.checkedAt)||0;
    const group=families.get(family)||new Map(),list=group.get(edition)||[];
    list.push({number,url,checked});group.set(edition,list);families.set(family,group);
  }
  const priority=['PRB','ST','P','EB','OP'];
  const last=items=>items.reduce((n,item)=>Math.max(n,item.checked),0);
  const family=[...families].sort((a,b)=>last([...a[1].values()].flat())-last([...b[1].values()].flat())||priority.indexOf(a[0])-priority.indexOf(b[0]))[0];
  if(!family)return null;
  const series=[...family[1]].sort((a,b)=>last(a[1])-last(b[1])||a[0].localeCompare(b[0],undefined,{numeric:true}))[0];
  return series[1].sort((a,b)=>a.checked-b.checked||a.number.localeCompare(b.number))[0];
}
