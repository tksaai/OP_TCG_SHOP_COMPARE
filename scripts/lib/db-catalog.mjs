import {CARD_NUMBER} from '../../public/shop-search.js';
export const DB_ROOT='https://tksaai.github.io/OP_TCG_DB';
const seriesCodes=text=>[...String(text||'').normalize('NFKC').matchAll(/\b(OP|EB|PRB|ST)[-\s]?(\d{2})(?!\d)/gi)].map(m=>m[1].toUpperCase()+m[2]);
export function buildDbCatalog(cards,manifest,master,previous={}){
  if(!Array.isArray(cards)||!cards.length||!manifest?.cards||!master?.entries)throw new Error('OP_TCG_DBのリスト形式が不正です');
  const catalog={},labels={};
  for(const [code,entry] of Object.entries(master.entries))if(/^(?:(?:OP|ST|PRB|EB)\d{2}|P)$/.test(code))labels[code]=entry.label||code;
  for(const card of cards){
    const number=String(card.cardNumber||'').normalize('NFKC').toUpperCase();
    // DON IDs are DB image identifiers, not storefront card numbers.
    if(!CARD_NUMBER.test(number))continue;
    if(catalog[number]||!card.cardName)throw new Error(`DBカードが重複または名前未設定: ${number}`);
    const edition=number.split('-')[0];
    const series=[...new Set([edition,...seriesCodes(card.getInfo),...(manifest.cards[number]||[]).flatMap(v=>seriesCodes(v.getInfo))])].sort();
    const image=previous[number]?.image;
    catalog[number]={name:card.cardName,furigana:card.furigana||'',rarity:card.rarity||'',color:card.color||[],edition,series,seriesLabels:series.map(id=>labels[id]||id),db:true,...(image?{image}:{})};
  }
  // Keep collected products outside the DB searchable without claiming DB membership.
  for(const [number,meta] of Object.entries(previous))if(!catalog[number]&&CARD_NUMBER.test(number))catalog[number]={...meta,db:false,series:[number.split('-')[0]],seriesLabels:[]};
  const sourceCards=Object.values(catalog).filter(c=>c.db).length;
  const excluded=cards.filter(c=>!CARD_NUMBER.test(String(c.cardNumber||'').normalize('NFKC').toUpperCase()));
  return {catalog,info:{schemaVersion:1,source:DB_ROOT,sourceCards,excludedCards:excluded.length,excludedNumbers:excluded.filter(c=>!String(c.cardNumber).startsWith('DON-')).map(c=>c.cardNumber),exclusion:'ドン!!のDB管理番号と型番未確定のカードは店舗の価格照合対象外',series:Object.entries(labels).map(([id,label])=>({id,label}))}};
}
