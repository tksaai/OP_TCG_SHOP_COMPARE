export const CARD_NUMBER=/^(?:(?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})$/;
export function cardLookup(shop,number){
  if(!CARD_NUMBER.test(number))return null;
  const search=shop.cardSearch;
  if(search){
    const url=new URL(search.path,shop.origin);
    if(url.origin!==shop.origin||url.protocol!=='https:')return null;
    url.searchParams.set(search.parameter,number);
    return {url:url.href,kind:'search',label:'型番で検索'};
  }
  const root=shop.seriesSeeds?.[number.split('-')[0]]?.[0];
  if(root){const url=new URL(root,shop.origin);if(url.origin===shop.origin&&url.protocol==='https:')return {url:url.href,kind:'series',label:'収録弾を見る'};}
  return null;
}
