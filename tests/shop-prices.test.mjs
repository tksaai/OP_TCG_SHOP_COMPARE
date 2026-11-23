import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shopPriceRows,shopLinks} from '../public/shop-links.js';
const number='OP18-021',now=Date.parse('2026-11-23T12:00:00Z');
const shops=[{id:'a',name:'店舗A',origin:'https://example.com',enabled:true},{id:'b',name:'店舗B',origin:'https://b.example.com',enabled:false}];
const offer=(id,price,stock,extra={})=>({id,shopId:'a',number,key:`${number}:normal:ja:standard`,verified:true,variant:'normal',condition:'standard',language:'ja',price,stock,observedAt:'2026-11-23T11:00:00Z',title:number,url:'https://example.com/product/'+id,...extra});
test('store comparison prefers available normal prints and keeps cheaper sold-out and parallels separate',()=>{
  const data={policy:{staleAfterHours:36},offers:[offer('sold',50,'out'),offer('normal',100,'in'),offer('parallel',1,'in',{verified:false,key:'parallel',variant:'parallel'}),offer('other',1,'in',{number:'OP18-022'}),offer('old',2,'in',{observedAt:'2026-11-20T00:00:00Z'})]};
  const rows=shopPriceRows(shops,number,data,now);
  assert.equal(rows[0].offer.id,'normal');assert.equal(rows[0].offers.length,4);
  assert.equal(rows[1].status,'自動取得停止中');assert.equal(rows[1].offer,undefined);
  const html=shopLinks(shops,number,data,{open:true});
  assert.match(html,/価格・在庫/);assert.match(html,/ほかの掲載商品/);assert.match(html,/¥50/);assert.match(html,/店舗B/);
});
test('sold-out references, stale prices, and uncollected cards remain distinct',()=>{
  const data={policy:{staleAfterHours:36},offers:[offer('sold',50,'out')]};
  assert.equal(shopPriceRows(shops,number,data,now)[0].offer.stock,'out');
  data.offers=[offer('old',100,'in',{observedAt:'2026-11-20T00:00:00Z'})];
  assert.equal(shopPriceRows(shops,number,data,now)[0].fresh,false);
  data.offers=[offer('damaged',20,'in',{condition:'B',verified:false})];
  assert.equal(shopPriceRows(shops,number,data,now)[0].status,'通常版は未取得');
  data.offers=[];assert.equal(shopPriceRows(shops,number,data,now)[0].status,'未取得');
  data.lookupStatus=[{number,shopId:'a',status:'not_found'}];
  assert.equal(shopPriceRows(shops,number,data,now)[0].status,'確認時の検索結果なし');
});
test('saved OP18-021 data renders a row for all configured stores with normal prices',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/data/prices.json',import.meta.url),'utf8'));
  const rows=shopPriceRows(data.shops,number,data,Date.parse(data.generatedAt));
  assert.equal(rows.length,data.shops.length);assert.ok(rows.filter(r=>r.offer).length>=7);
  assert.ok(rows.filter(r=>r.offer).every(r=>r.offer.number===number&&r.offer.verified));
});
