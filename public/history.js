export function validateHistory(data){
  if(data?.schemaVersion!==1||!data.products||typeof data.products!=='object'||Array.isArray(data.products))throw new Error('履歴ファイルの形式が不正です');
  for(const p of Object.values(data.products)){
    if(!p.key||!p.shopId||!Array.isArray(p.points))throw new Error('履歴商品の形式が不正です');
    for(const x of p.points)if(!Array.isArray(x)||!Number.isFinite(Date.parse(x[0]))||Date.parse(x[0])>Date.now()+60000||!Number.isSafeInteger(x[1])||x[1]<=0||!['in','out','unknown'].includes(x[2]))throw new Error('履歴の観測値が不正です');
  }
  return data;
}
export function trendsFor(history,key,{from=-Infinity,to=Date.now(),shopId='',staleAfterHours=36,productId=''}={}){
  const products=Object.entries(history.products).filter(([id,p])=>(!key||p.key===key)&&(!productId||id===productId)&&(!shopId||p.shopId===shopId));
  const events=new Map(),records=[];
  for(const [id,p]of products)for(const point of p.points){
    const time=Date.parse(point[0]);if(time>to)continue;
    const k=`${p.shopId}|${time}`,event=events.get(k)||{shopId:p.shopId,time,updates:[]};
    event.updates.push({id,price:point[1],stock:point[2],time});events.set(k,event);
    if(time>=from)records.push({id,shopId:p.shopId,time,price:point[1],stock:point[2],title:p.title});
  }
  const current=new Map(),series=new Map(),ttl=staleAfterHours*3600000;
  for(const event of [...events.values()].sort((a,b)=>a.time-b.time)){
    const state=current.get(event.shopId)||new Map();
    for(const u of event.updates)state.set(u.id,u);current.set(event.shopId,state);
    if(event.time<from)continue;
    const valid=[...state.values()].filter(x=>x.stock==='in'&&event.time-x.time<=ttl);
    const line=series.get(event.shopId)||[];
    line.push({time:event.time,price:valid.length?Math.min(...valid.map(x=>x.price)):null});series.set(event.shopId,line);
  }
  return {series:[...series].map(([shopId,points])=>({shopId,points})),records:records.sort((a,b)=>b.time-a.time||a.shopId.localeCompare(b.shopId)),ttl};
}
