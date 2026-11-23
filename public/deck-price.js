import {isFresh} from './compare.js';

export function parseSimDeck(text){
  const source=String(text??'').normalize('NFKC').replace(/^\uFEFF/,'');
  if(!source.trim())throw new Error('OPTCGSimのデッキテキストを貼り付けてください。');
  if(source.length>16000)throw new Error('入力が長すぎます。デッキテキストだけを貼り付けてください。');
  const counts=new Map();let total=0;
  for(const [index,raw] of source.split(/\r\n|\n|\r/).entries()){
    const line=raw.trim();if(!line)continue;
    const match=line.match(/^(\d{1,3})\s*[xX×]\s*((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})$/i);
    if(!match)throw new Error(`${index+1}行目を読み取れません。「4xOP01-016」の形式で入力してください。`);
    const quantity=Number(match[1]),number=match[2].toUpperCase();
    if(quantity<1 || quantity>100)throw new Error(`${index+1}行目の枚数は1〜100枚にしてください。`);
    total+=quantity;if(total>200)throw new Error('一度に計算できるのは合計200枚までです。');
    counts.set(number,(counts.get(number)||0)+quantity);
  }
  return [...counts].map(([number,quantity])=>({number,quantity}));
}

export function priceDeck(entries,snapshot,{shopId='',now=Date.now()}={}){
  const byNumber=new Map(),references=new Map(),seen=new Set();
  for(const offer of snapshot.offers){
    if(shopId && offer.shopId!==shopId)continue;
    // Estimate original Japanese normal prints only; artwork-only Sim suffixes
    // are not silently converted to a normal-print price by the parser.
    if(!offer.verified || offer.variant!=='normal' || offer.language!=='ja' || offer.condition!=='standard' || offer.key!==`${offer.number}:normal:ja:standard`)continue;
    if(!isFresh(offer,snapshot.policy,now))continue;
    if(seen.has(offer.id))continue;seen.add(offer.id);
    if(offer.stock==='out'){
      const old=references.get(offer.number);
      if(!old||offer.price<old.price||(offer.price===old.price&&offer.observedAt>old.observedAt))references.set(offer.number,offer);
      continue;
    }
    if(offer.stock!=='in')continue;
    if(!byNumber.has(offer.number))byNumber.set(offer.number,[]);
    byNumber.get(offer.number).push(offer);
  }
  const rows=entries.map(entry=>{
    const candidates=(byNumber.get(entry.number)||[]).sort((a,b)=>a.price-b.price||b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id));
    let remaining=entry.quantity;const allocations=[];
    for(const offer of candidates){
      const known=Number.isSafeInteger(offer.stockQuantity)&&offer.stockQuantity>=0;
      const quantity=Math.min(remaining,known?offer.stockQuantity:remaining);
      if(quantity){allocations.push({offer,quantity,subtotal:offer.price*quantity,quantityUnconfirmed:!known});remaining-=quantity;}
      if(!remaining)break;
    }
    const subtotal=allocations.reduce((n,a)=>n+a.subtotal,0);
    const refOffer=remaining?references.get(entry.number):null;
    const reference=refOffer?{offer:refOffer,quantity:remaining,subtotal:refOffer.price*remaining}:null;
    return {...entry,allocations,reference,subtotal:allocations.length?subtotal:null,pricedQuantity:entry.quantity-remaining,missingQuantity:remaining,
      reason:remaining?(candidates.length?'確認できる在庫数が不足':'通常版の新しい在庫あり価格がありません'):''};
  });
  const quantity=entries.reduce((n,e)=>n+e.quantity,0),pricedQuantity=rows.reduce((n,r)=>n+r.pricedQuantity,0);
  const subtotal=pricedQuantity?rows.reduce((n,r)=>n+(r.subtotal??0),0):null;
  const referenceQuantity=rows.reduce((n,r)=>n+(r.reference?.quantity||0),0);
  const referenceSubtotal=pricedQuantity+referenceQuantity?(subtotal||0)+rows.reduce((n,r)=>n+(r.reference?.subtotal||0),0):null;
  return {rows,quantity,pricedQuantity,missingQuantity:quantity-pricedQuantity,subtotal,total:pricedQuantity===quantity?subtotal:null,
    referenceQuantity,referenceSubtotal,referenceTotal:pricedQuantity+referenceQuantity===quantity?referenceSubtotal:null,
    quantityUnconfirmed:rows.some(r=>r.allocations.some(a=>a.quantityUnconfirmed))};
}
