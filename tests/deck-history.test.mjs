import test from 'node:test';
import assert from 'node:assert/strict';
import {deckTrend,historyProductId,historySelections} from '../public/deck-history.js';
import {trendsFor} from '../public/history.js';
import {historyChart,mountHistory,resetHistoryCache} from '../public/history-view.js';
import {deckHistoryRecords,mountDeckHistory} from '../public/deck-history-view.js';
const base=Date.parse('2026-01-01T00:00:00Z'),hour=3600000;
const point=(h,price,stock='in')=>[new Date(base+h*hour).toISOString(),price,stock];
const product=(number,points,shopId='a',edition='normal')=>({number,key:`${number}:${edition}:ja:standard`,shopId,points});
const entries=[{number:'OP18-021',quantity:4},{number:'EB02-017',quantity:2}];
const run=(products,options={})=>deckTrend({products},entries,{to:base+12*hour,...options});

test('deck trend uses quantity and cheapest normal unit prices; no future lookahead',()=>{
 const t=run({a:product('OP18-021',[point(0,30),point(3,20)]),b:product('EB02-017',[point(1,100)]),c:product('OP18-021',[point(2,25)],'b'),p:product('OP18-021',[point(0,1)],'a','parallel')});
 assert.deepEqual(t.series[0].points.map(p=>p.price),[null,320,300,280]);
 assert.equal(t.records.at(-1).subtotal,120);assert.deepEqual(t.records.at(-1).missing,['EB02-017']);
 assert.equal(t.quantity,6);assert.equal(t.records[0].pricedQuantity,6);
});
test('sold-out and unknown prices stay out of reference deck totals',()=>{
 const t=run({a:product('OP18-021',[point(0,30),point(2,15,'out'),point(3,10,'unknown'),point(4,40)]),b:product('EB02-017',[point(0,100)])});
 assert.deepEqual(t.series[0].points.map(p=>p.price),[320,null,null,360]);
});
test('missing cards are not treated as zero, including entirely empty history',()=>{
 const t=run({a:product('OP18-021',[point(0,30)])});assert.equal(t.records[0].price,null);assert.equal(t.records[0].pricedQuantity,4);
 assert.equal(run({}).records.length,0);assert.deepEqual(run({}).series[0].points,[]);
});
test('expiry breaks lines even when observations resume within 36 hours of last total',()=>{
 const t=run({a:product('OP18-021',[point(0,30),point(40,20)]),b:product('EB02-017',[point(30,100)])},{to:base+42*hour});
 assert.deepEqual(t.series[0].points.map(p=>p.price),[null,320,null,280]);
 assert.equal(t.series[0].points[2].time,base+36*hour+1);
 assert.equal(t.records.length,3); // An expiry gap is not an invented observation.
 const old=run({a:product('OP18-021',[point(0,30)]),b:product('EB02-017',[point(37,100)])},{to:base+38*hour});
 assert.equal(old.records[0].price,null);
});
test('shop and selected product filters never silently fall back to other listings',()=>{
 const products={a:product('OP18-021',[point(0,30)]),b:product('EB02-017',[point(0,100)]),p:product('OP18-021',[point(0,200)],'b','parallel')};
 assert.equal(run(products,{shopId:'a'}).records[0].price,320);
 assert.equal(run(products,{selectedProducts:{'OP18-021':'p'}}).records[0].price,1000);
 assert.equal(run(products,{shopId:'a',selectedProducts:{'OP18-021':'p'}}).records[0].price,null);
 assert.equal(run(products,{selectedProducts:{'OP18-021':'gone'}}).records[0].price,null);
});
test('range limits replay older state but never fabricate boundary or future prices',()=>{
 const products={a:product('OP18-021',[point(0,30),point(5,50)]),b:product('EB02-017',[point(2,100)])};
 const t=run(products,{from:base+hour,to:base+3*hour});assert.deepEqual(t.series[0].points,[{time:base+2*hour,price:320}]);
 assert.equal(run(products,{from:base+6*hour}).records.length,0);
});
test('selected history identifiers match persisted legacy and explicit product IDs',()=>{
 const offer={id:'legacy',number:'OP18-021',shopId:'a',url:'https://example.com/view/item/123'};
 assert.equal(historyProductId(offer),'a:123');assert.equal(historyProductId({...offer,productId:'SKU-7'}),'a:SKU-7');
 assert.equal(historyProductId({...offer,url:'https://example.com/shop/g/gX/?q=1'}),'a:/shop/g/gX/');
 assert.deepEqual(historySelections({offers:[offer]},{'OP18-021':'legacy'}),{'OP18-021':'a:123'});
 const products={'a:123':product('OP18-021',[point(0,200)],'a','parallel'),other:product('OP18-021',[point(0,30)])};
 assert.deepEqual(trendsFor({products},'',{productId:'a:123',to:base+hour}).records.map(r=>r.price),[200]);
});
test('chart and records distinguish incomplete totals, escape text, and display one sample as a dot',()=>{
 const t=run({a:product('OP18-021',[point(0,30)]),b:product('EB02-017',[point(0,100)])});
 const html=historyChart(t,[{id:'deck',name:'Deck'}],{label:'<total>',countLabel:'点の参考合計'});
 assert.match(html,/1点の参考合計/);assert.match(html,/aria-label="&lt;total&gt;"/);assert.match(html,/<circle/);
 assert.doesNotMatch(html,/<path d="[^"]*L/);
 const records=deckHistoryRecords({...t,records:[{time:base,price:null,subtotal:120,pricedQuantity:4,missing:['<img>']}]});
 assert.match(records,/算出不可/);assert.match(records,/確認できた分のみ：¥120/);assert.match(records,/&lt;img&gt;/);
});
// Minimal view fixture to exercise async loading and controls without a browser dependency.
function viewContainer(){
 const controls=new Map([['[data-history-range]',{value:'all'}],['[data-history-shop]',{value:''}],['[data-history-chart]',{}],['[data-history-records]',{}]]);
 for(const control of controls.values())control.addEventListener=()=>{};
 return {isConnected:true,innerHTML:'',querySelector:s=>controls.get(s),querySelectorAll:()=>[controls.get('[data-history-range]'),controls.get('[data-history-shop]')]};
}
test('deck and card history share one lazy fetch and honor initial selected shop and product',async()=>{
 const original=globalThis.fetch;let calls=0;resetHistoryCache();
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({schemaVersion:1,products:{'b:123':product('OP18-021',[point(0,200)],'b','parallel')}})};};
 try{
  const shops=[{id:'a',name:'A'},{id:'b',name:'B'}],container=viewContainer();
  await mountDeckHistory(container,entries,{shops,offers:[]},{shopId:'a',imported:true});
  assert.equal(container.querySelector('[data-history-shop]').value,'a');
  assert.match(container.innerHTML,/過去の在庫枚数は保存していない/);assert.match(container.innerHTML,/取込JSONの過去履歴は含みません/);
  assert.match(container.querySelector('[data-history-chart]').innerHTML,/全種類の有効な在庫あり履歴が揃う時点はありません/);
  const card=viewContainer();await mountHistory(card,{key:''},shops,{staleAfterHours:36},{productId:'b:123',shopId:'a'});
  assert.equal(card.querySelector('[data-history-shop]').value,'a');assert.doesNotMatch(card.querySelector('[data-history-records]').innerHTML,/¥200/);
  const chosen=viewContainer();await mountHistory(chosen,{key:''},shops,{staleAfterHours:36},{productId:'b:123',shopId:'b'});
  assert.match(chosen.querySelector('[data-history-records]').innerHTML,/¥200/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;resetHistoryCache();}
});
