import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSimDeck,priceDeck} from '../public/deck-price.js';
const now=Date.parse('2026-11-23T03:00:00Z');
const policy={staleAfterHours:36};
const offer=(number,shopId,price,extra={})=>({number,shopId,id:`${shopId}:${number}`,key:`${number}:normal:ja:standard`,verified:true,variant:'normal',language:'ja',condition:'standard',stock:'in',observedAt:new Date(now-3600000).toISOString(),price,...extra});
const snapshot=offers=>({policy,offers});

test('Sim input preserves leader and all quantities; normalizes whitespace and combines duplicate rows',()=>{
  const entries=parseSimDeck('\uFEFF1xOP01-001\r\n\r\n ２×op01-016 \r\n2X OP01-016\n4xST01-012');
  assert.deepEqual(entries,[{number:'OP01-001',quantity:1},{number:'OP01-016',quantity:4},{number:'ST01-012',quantity:4}]);
});
test('invalid rows never silently lower the total; print suffixes, zero, excess and empty input fail',()=>{
  for(const input of ['', '1xOP01-001\nnot-a-card','0xOP01-016','4xOP01-016_p1','101xOP01-016','100xOP01-001\n100xOP01-002\n1xOP01-003','x'.repeat(16001)])assert.throws(()=>parseSimDeck(input));
  assert.throws(()=>parseSimDeck('1xOP01-001\n<html>'),/2行目/);
});
test('drafts and unknown card numbers remain estimable instead of being dropped',()=>{
  const entries=parseSimDeck('1xOP99-001\n5xOP01-016');
  const result=priceDeck(entries,snapshot([offer('OP01-016','a',100,{stockQuantity:8})]),{now});
  assert.equal(result.quantity,6);assert.equal(result.pricedQuantity,5);assert.equal(result.missingQuantity,1);
  assert.equal(result.total,null);assert.equal(result.subtotal,500);assert.equal(result.rows[0].subtotal,null);
});
test('known stock is allocated across shops and leader is included in the deck total',()=>{
  const entries=parseSimDeck('1xOP01-001\n4xOP01-016');
  const data=snapshot([offer('OP01-001','a',500,{stockQuantity:1}),offer('OP01-016','b',200,{stockQuantity:4}),offer('OP01-016','a',100,{stockQuantity:2})]);
  const result=priceDeck(entries,data,{now});
  assert.equal(result.total,1100);assert.equal(result.quantityUnconfirmed,false);
  assert.deepEqual(result.rows[1].allocations.map(a=>[a.offer.shopId,a.quantity]),[['a',2],['b',2]]);
  const single=priceDeck(entries,data,{now,shopId:'a'});
  assert.equal(single.total,null);assert.equal(single.subtotal,700);assert.equal(single.missingQuantity,2);
});
test('unknown stock is explicitly flagged; known zero inventory cannot satisfy copies',()=>{
  const entries=parseSimDeck('4xOP01-016');
  const result=priceDeck(entries,snapshot([offer('OP01-016','a',10,{stockQuantity:0}),offer('OP01-016','b',100)]),{now});
  assert.equal(result.total,400);assert.equal(result.quantityUnconfirmed,true);assert.equal(result.rows[0].allocations[0].offer.shopId,'b');
});
test('stale, future, sold out, unknown stock status, alternate prints and foreign cards cannot lower estimate',()=>{
  const invalid=[{observedAt:new Date(now-37*3600000).toISOString()},{observedAt:new Date(now+3600000).toISOString()},{stock:'out'},{stock:'unknown'},{verified:false},{variant:'parallel'},{language:'foreign'},{condition:'B'},{key:'OP01-016:reprint'}];
  const offers=invalid.map((extra,i)=>offer('OP01-016',`bad${i}`,1,extra));offers.push(offer('OP01-016','valid',100,{stockQuantity:4}));
  const result=priceDeck(parseSimDeck('4xOP01-016'),snapshot(offers),{now});assert.equal(result.total,400);
});
test('a listing repeated across saved categories cannot duplicate available stock',()=>{
  const o=offer('OP01-016','a',100,{stockQuantity:2});
  const result=priceDeck(parseSimDeck('4xOP01-016'),snapshot([o,{...o}]),{now});
  assert.equal(result.total,null);assert.equal(result.subtotal,200);assert.equal(result.missingQuantity,2);
});
test('no available prices means unpriced, not a zero-yen deck',()=>{
  const result=priceDeck(parseSimDeck('1xP-001\n4xEB01-001'),snapshot([]),{now});
  assert.equal(result.subtotal,null);assert.equal(result.total,null);assert.equal(result.missingQuantity,5);
});
test('sold-out references fill only missing copies without making them purchasable',()=>{
  const result=priceDeck(parseSimDeck('4xOP01-016'),snapshot([
    offer('OP01-016','a',100,{stockQuantity:1}),offer('OP01-016','b',150,{stock:'out',stockQuantity:0})
  ]),{now});
  assert.equal(result.total,null);assert.equal(result.subtotal,100);assert.equal(result.pricedQuantity,1);
  assert.equal(result.referenceQuantity,3);assert.equal(result.referenceTotal,550);assert.equal(result.rows[0].reference.offer.shopId,'b');
});
test('reference quotes keep condition, print and freshness boundaries and missing-card totals',()=>{
  const result=priceDeck(parseSimDeck('4xEB02-017\n1xOP09-078'),snapshot([
    offer('EB02-017','b',1,{stock:'out',condition:'B'}),offer('EB02-017','c',2,{stock:'out',variant:'parallel'}),
    offer('EB02-017','d',3,{stock:'out',observedAt:new Date(now-37*3600000).toISOString()}),
    offer('EB02-017','a',180,{stock:'out'})
  ]),{now});
  assert.equal(result.subtotal,null);assert.equal(result.referenceSubtotal,720);assert.equal(result.referenceTotal,null);
  assert.equal(result.rows[0].reference.offer.shopId,'a');assert.equal(result.rows[1].reference,null);
});
