import {normalise} from './compare.js';
export function matchesCatalogGroup(g,{terms=[],edition='',variant='normal'}={}){
  if(edition&&g.edition!==edition&&!g.meta.series?.includes(edition))return false;
  if(variant==='normal'&&(!g.verified||g.variant!=='normal'))return false;
  if(variant==='parallel'&&g.variant==='normal'&&g.verified)return false;
  const text=normalise(`${g.name} ${g.number} ${g.meta.furigana||''} ${(g.meta.series||[]).join(' ')} ${(g.meta.seriesLabels||[]).join(' ')} ${g.offers.map(o=>o.title).join(' ')}`);
  return terms.every(t=>text.includes(normalise(t)));
}
export function catalogSeries(groups,info={}){
  const ids=new Set([...groups.flatMap(g=>[g.edition,...(g.meta.series||[])]),...(info.series||[]).map(s=>s.id)]);
  const labels=new Map((info.series||[]).map(s=>[s.id,s.label]));
  return [...ids].filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(id=>({id,label:labels.get(id)||id}));
}
