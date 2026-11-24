// History records contain sale price and stock status, not historical stock counts.
// This is a unit-price × deck-quantity reference trend, never a purchasable quote.
export function historyProductId(offer){
  if(!offer)return '';
  const path=new URL(offer.url).pathname;
  const productId=offer.productId||path.match(/\/(?:shopdetail|product|view\/item)\/(\d+)/)?.[1]||path;
  return `${offer.shopId}:${productId}`;
}
export function historySelections(snapshot,selectedOffers){
  return Object.fromEntries(Object.entries(selectedOffers).map(([number,id])=>{
    const offer=snapshot.offers.find(o=>o.number===number&&o.id===id);
    return [number,offer?historyProductId(offer):id];
  }));
}
export function deckTrend(history,entries,{from=-Infinity,to=Date.now(),shopId='',selectedProducts={},staleAfterHours=36}={}){
  const wanted=new Map(entries.map(e=>[e.number,e])),events=new Map(),state=new Map(),ttl=staleAfterHours*3600000;
  for(const [id,p] of Object.entries(history.products)){
    const number=p.number||p.key.split(':')[0];if(!wanted.has(number)||shopId&&p.shopId!==shopId)continue;
    if(selectedProducts[number]?id!==selectedProducts[number]:p.key!==`${number}:normal:ja:standard`)continue;
    for(const point of p.points){
      const time=Date.parse(point[0]);if(time>to)continue;
      const updates=events.get(time)||[];updates.push({id,number,time,price:point[1],stock:point[2]});events.set(time,updates);
    }
  }
  const points=[],records=[];let validUntil=null;
  for(const [time,updates] of [...events].sort((a,b)=>a[0]-b[0])){
    for(const update of updates)state.set(update.id,update);
    if(time<from)continue;
    if(validUntil!==null&&validUntil<time)points.push({time:validUntil+1,price:null});
    const cheapest=new Map();
    for(const item of state.values()){
      if(item.stock!=='in'||time-item.time>ttl)continue;
      const old=cheapest.get(item.number);
      if(!old||item.price<old.price||item.price===old.price&&item.time>old.time)cheapest.set(item.number,item);
    }
    const missing=entries.filter(e=>!cheapest.has(e.number)).map(e=>e.number);
    const subtotal=entries.reduce((n,e)=>n+(cheapest.get(e.number)?.price||0)*e.quantity,0);
    const price=entries.length&&!missing.length?subtotal:null;
    const pricedQuantity=entries.reduce((n,e)=>n+(cheapest.has(e.number)?e.quantity:0),0);
    validUntil=price===null?null:Math.min(...[...cheapest.values()].map(p=>p.time+ttl));
    points.push({time,price});records.push({time,price,subtotal:pricedQuantity?subtotal:null,pricedQuantity,missing});
  }
  if(validUntil!==null&&validUntil<to)points.push({time:validUntil+1,price:null});
  return {series:[{shopId:'deck',points}],records:records.reverse(),ttl,quantity:entries.reduce((n,e)=>n+e.quantity,0)};
}
