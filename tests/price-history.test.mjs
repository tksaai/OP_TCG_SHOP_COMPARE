import test from 'node:test';import assert from 'node:assert/strict';
import {mergeHistory} from '../scripts/lib/price-history.mjs';
import {trendsFor,validateHistory} from '../public/history.js';
const config={shops:[{id:'shop',origin:'https://example.com',seriesSeeds:{OP18:['/product-group/18']}}]};
const at='2026-01-01T00:00:00.000Z',later='2026-01-02T00:00:00.000Z';
const offer={shopId:'shop',title:'カルー【L】{OP18-001}',model:'',url:'https://example.com/product/1',price:100,stock:'in',observedAt:at,pageUrl:'https://example.com/product-group/18'};
const snap=o=>({offers:[o]});
test('history saves source observation dates; cache replay is idempotent; actual refresh adds samples',()=>{
 let h=mergeHistory(null,snap(offer),config);h=mergeHistory(h,snap(offer),config);assert.equal(h.products['shop:1'].points.length,1);
 h=mergeHistory(h,snap({...offer,price:120,observedAt:later}),config);assert.deepEqual(h.products['shop:1'].points,[[at,100,'in'],[later,120,'in']]);validateHistory(h);
});
test('backfill handles out-of-order snapshots and canonicalizes legacy product IDs',()=>{
 let h=mergeHistory(null,snap({...offer,observedAt:later}),config);h=mergeHistory(h,snap({...offer,id:'old:key'}),config);
 assert.equal(Object.keys(h.products).length,1);assert.equal(h.firstObservedAt,at);assert.equal(h.products['shop:1'].points[1][0],later);
});
test('unknown and sold-out observations stay in records but break cheapest-price graph',()=>{
 let h=mergeHistory(null,snap(offer),config);h=mergeHistory(h,snap({...offer,stock:'out',observedAt:later}),config);
 const t=trendsFor(h,'OP18-001:normal:ja:standard');assert.deepEqual(t.series[0].points.map(p=>p.price),[100,null]);assert.equal(t.records.length,2);
});
test('old sale price expires when another product is observed, instead of remaining the cheapest forever',()=>{
 let h=mergeHistory(null,snap(offer),config);h=mergeHistory(h,snap({...offer,url:'https://example.com/product/2',price:150,observedAt:'2026-01-04T00:00:00.000Z'}),config);
 const t=trendsFor(h,'OP18-001:normal:ja:standard');assert.deepEqual(t.series[0].points.map(p=>p.price),[100,150]);
});
test('different prints cannot leak into normal price history',()=>{
 let h=mergeHistory(null,snap(offer),config);h=mergeHistory(h,snap({...offer,title:'カルー(パラレル) OP18-001',url:'https://example.com/product/2',price:2000}),config);
 const t=trendsFor(h,'OP18-001:normal:ja:standard');assert.equal(t.records.length,1);assert.equal(t.records[0].price,100);
});
test('date and shop filters do not synthesize samples at the start or end of the selected range',()=>{
 const h=mergeHistory(null,snap(offer),config);const empty=trendsFor(h,'OP18-001:normal:ja:standard',{from:Date.parse(later)});assert.equal(empty.records.length,0);assert.equal(empty.series.length,0);
 assert.equal(trendsFor(h,'OP18-001:normal:ja:standard',{shopId:'other'}).records.length,0);
});
