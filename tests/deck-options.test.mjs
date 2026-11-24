import test from 'node:test';
import assert from 'node:assert/strict';
import {priceDeck,compareDeckStores} from '../public/deck-price.js';
import {renderDeckOptions} from '../public/deck-options.js';
import {renderStoreRecommendation} from '../public/deck-view.js';
const now=Date.parse('2026-11-24T01:00:00Z'),number='OP18-021',entries=[{number,quantity:4}];
const offer=(shopId,price,extra={})=>({id:shopId,shopId,number,title:'フランキー',url:`https://${shopId}.example/product/1`,key:`${number}:normal:ja:standard`,verified:true,variant:'normal',condition:'standard',language:'ja',stock:'in',stockQuantity:4,observedAt:new Date(now-1000).toISOString(),price,...extra});
const snapshot=offers=>({policy:{staleAfterHours:36},shops:[...new Set(offers.map(o=>o.shopId))].map(id=>({id,name:id,origin:`https://${id}.example`,enabled:true})),offers});

test('single-store minimum excludes partial/sold-out/expired coverage, distinguishes unknown quantities and returns ties',()=>{
  const d=snapshot([offer('a',100),offer('b',100),offer('cheap-partial',1,{stockQuantity:3}),offer('sold',2,{stock:'out',stockQuantity:0}),offer('old',3,{observedAt:'2026-11-20T00:00:00Z'}),offer('unknown',50,{stockQuantity:null})]);
  const result=compareDeckStores(entries,d,{now});
  assert.deepEqual(result.winners.map(x=>x.shop.id),['a','b']);assert.equal(result.winners[0].quote.total,400);
  assert.equal(result.completeShopCount,2);assert.deepEqual(result.referenceWinners.map(x=>x.shop.id),['unknown']);
  const html=renderStoreRecommendation(result);assert.match(html,/同額/);assert.match(html,/在庫枚数未確認/);assert.match(html,/data-deck-stock="confirmed"/);
});
test('known-stock estimate can use a more expensive available listing at the same store',()=>{
  const d=snapshot([offer('a',1,{id:'a:unknown',stockQuantity:null}),offer('a',20,{id:'a:known'})]);
  const result=compareDeckStores(entries,d,{now});assert.equal(result.winners[0].quote.total,80);assert.equal(result.referenceWinners[0].quote.total,4);
  assert.equal(compareDeckStores(entries,snapshot([offer('a',1,{stockQuantity:3})]),{now}).winners.length,0);
  assert.equal(compareDeckStores([],d,{now}).winners.length,0);
});
test('single-store minimum must cover every card, not just have a low partial subtotal',()=>{
  const other='OP18-022',rows=[...entries,{number:other,quantity:1}];
  const d=snapshot([offer('a',10),offer('b',20),offer('b',100,{id:'b:other',number:other,key:`${other}:normal:ja:standard`,stockQuantity:1})]);
  const result=compareDeckStores(rows,d,{now});assert.deepEqual(result.winners.map(x=>x.shop.id),['b']);assert.equal(result.winners[0].quote.total,180);
});
test('explicit alternative selects the exact product/store and applies to single-store comparison',()=>{
  const d=snapshot([offer('a',10),offer('b',200,{id:'parallel',verified:false,variant:'parallel',key:'parallel',title:'フランキー パラレル'})]);
  assert.equal(priceDeck(entries,d,{now}).total,40);
  const selectedOffers={[number]:'parallel'},quote=priceDeck(entries,d,{now,selectedOffers});
  assert.equal(quote.total,800);assert.equal(quote.rows[0].allocations[0].offer.id,'parallel');
  const result=compareDeckStores(entries,d,{now,selectedOffers});assert.deepEqual(result.winners.map(x=>x.shop.id),['b']);
  const otherShop=priceDeck(entries,d,{now,selectedOffers,shopId:'a'});assert.equal(otherShop.total,null);assert.match(otherShop.rows[0].reason,/別の店舗/);
  assert.equal(priceDeck(entries,d,{now,selectedOffers:{}}).total,40);
});
test('selected alternative enforces quantity, staleness and product identity without silently falling back',()=>{
  const d=snapshot([offer('a',10),offer('b',200,{id:'chosen',verified:false,stockQuantity:2})]),selectedOffers={[number]:'chosen'};
  assert.equal(priceDeck(entries,d,{now,selectedOffers}).subtotal,400);assert.equal(priceDeck(entries,d,{now,selectedOffers}).total,null);
  d.offers[1].observedAt='2026-11-20T00:00:00Z';assert.equal(priceDeck(entries,d,{now,selectedOffers}).subtotal,null);
  d.offers[1].number='OP18-022';assert.equal(priceDeck(entries,d,{now,selectedOffers}).subtotal,null);
  const removed=priceDeck(entries,d,{now,selectedOffers:{[number]:'gone'}});assert.equal(removed.total,null);assert.match(removed.rows[0].reason,/保存データ/);
});
test('a chosen sold-out alternative is reference-only, even with an available automatic normal option',()=>{
  const d=snapshot([offer('a',10),offer('b',200,{id:'sold',verified:false,variant:'parallel',stock:'out',stockQuantity:0})]);
  const selectedOffers={[number]:'sold'},quote=priceDeck(entries,d,{now,selectedOffers});
  assert.equal(quote.pricedQuantity,0);assert.equal(quote.total,null);assert.equal(quote.referenceTotal,800);
  assert.equal(compareDeckStores(entries,d,{now,selectedOffers}).winners.length,0);
});
test('radio options escape product text and disable expired or unknown-stock listings',()=>{
  const d=snapshot([offer('a',10,{title:'<img onerror="alert(1)">'}),offer('b',20,{stock:'unknown'}),offer('c',30,{observedAt:'2026-11-20T00:00:00Z'})]);
  const row=priceDeck(entries,d,{now}).rows[0],html=renderDeckOptions(row,d,{now});
  assert.match(html,/type="radio"/);assert.match(html,/通常版から自動選択/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  assert.match(html,/value="b"[^>]*disabled/);assert.match(html,/value="c"[^>]*disabled/);
});
