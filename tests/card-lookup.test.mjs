import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cardLookup} from '../public/shop-search.js';
import {lookupTargets,promoteLookups,parseRequestedCards,lookupReport} from '../scripts/lib/card-lookup.mjs';
import {nextPage,addDiscovered} from '../scripts/lib/crawl-plan.mjs';
import {parsePage} from '../scripts/lib/adapters.mjs';
test('all enabled stores have observed search or series routes for both reported cards',async()=>{
  const config=JSON.parse(await readFile(new URL('../config/shops.json',import.meta.url),'utf8'));
  for(const shop of config.shops.filter(s=>s.enabled))for(const number of ['EB02-017','OP09-078']){
    const target=cardLookup(shop,number);assert.ok(target,`${shop.id}: ${number}`);assert.equal(new URL(target.url).origin,shop.origin);
    if(target.kind==='search')assert.ok(target.url.includes(number));
  }
});
test('lookup never constructs external or malformed-card URLs',()=>{
  const s={origin:'https://example.com',cardSearch:{path:'https://evil.example/search',parameter:'q'}};
  assert.equal(cardLookup(s,'EB02-017'),null);
  assert.equal(cardLookup({...s,cardSearch:{path:'/search',parameter:'q'}},'../secret'),null);
  assert.throws(()=>parseRequestedCards('EB02-017,$(whoami)'));
  assert.deepEqual(parseRequestedCards('eb02-017, OP09-078 EB02-017'),['EB02-017','OP09-078']);
});
test('a long general queue and first-search pagination cannot starve the second target',()=>{
  const shop={origin:'https://example.com',cardSearch:{path:'/product-list',parameter:'keyword'}};
  const targets=lookupTargets(shop,['EB02-017','OP09-078']),queue=promoteLookups(['https://example.com/old?page=99'],targets),visited=new Set();
  assert.equal(nextPage(queue,visited,[targets[0]]),targets[0]);
  addDiscovered(queue,[targets[0]+'&page=2']);
  assert.equal(nextPage(queue,visited,[targets[1]]),targets[1]);
  assert.ok(queue.includes('https://example.com/old?page=99'));
});
test('sold-out cart listings retain the published sale price and zero stock',()=>{
  const html='<li class="list_item_cell"><a href="/product/42"><span class="goods_name">ナミ【R】{EB02-017}</span></a><p class="selling_price">180円</p><p class="stock">在庫 0枚 SOLD OUT</p></li>';
  const offers=parsePage({adapter:'cardrush'},html,'https://example.com/product-list?keyword=EB02-017').offers;
  assert.equal(offers.length,1);assert.equal(offers[0].price,180);assert.equal(offers[0].stock,'out');assert.equal(offers[0].stockQuantity,0);
});
test('report distinguishes paused, pending, empty and found sold-out products',()=>{
  const shop={id:'a',enabled:true,origin:'https://example.com',cardSearch:{path:'/search',parameter:'q'}};
  const url=cardLookup(shop,'EB02-017').url;
  const report=(pages,offers,enabled=true)=>lookupReport({shops:[{...shop,enabled}]},['EB02-017'],pages,offers)[0];
  assert.equal(report({},[]).status,'pending');assert.equal(report({},[],false).status,'paused');
  assert.equal(report({[url]:{observedAt:'2026-11-23T00:00:00Z',searchEmpty:true}},[]).status,'not_found');
  assert.equal(report({},[{shopId:'a',number:'EB02-017',stock:'out'}]).soldOutCount,1);
});
