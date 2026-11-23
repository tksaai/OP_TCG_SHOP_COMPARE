import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePage} from '../scripts/lib/adapters.mjs';
import {identify} from '../scripts/lib/identity.mjs';
import {listKey,canonicalPage,pageNumber} from '../scripts/lib/crawl-plan.mjs';
import {auditList} from '../scripts/lib/coverage.mjs';
import {robotsPolicy} from '../scripts/lib/http.mjs';
import {priceDeck} from '../public/deck-price.js';
import {offerTable,priceSourceNote} from '../public/offer-view.js';
const config=JSON.parse(await readFile(new URL('../config/shops.json',import.meta.url),'utf8'));
const fixtures=Object.fromEntries(await Promise.all(['tierone','fukufuku','torecolo'].map(async id=>[id,await readFile(new URL(`fixtures/${id}.html`,import.meta.url),'utf8')])));
function parsed(id,html=fixtures[id]){const shop=config.shops.find(s=>s.id===id),url=new URL(shop.seeds[0],shop.origin).href;return parsePage(shop,html,url).offers.map(o=>({...o,...identify(o,shop,url),shopId:id,id:`${id}:${o.productId}`}));}
test('three new real-store fixtures identify OP18-021 normal prices and stock independently of parallels',()=>{
  for(const [id,amount,quantity] of [['tierone',30,28],['fukufuku',30,19],['torecolo',10,17]]){
    const offers=parsed(id),normal=offers.find(o=>o.number==='OP18-021'&&o.verified);
    assert.equal(normal.price,amount,id);assert.equal(normal.stockQuantity,quantity,id);assert.equal(normal.stock,'in');
    assert.ok(offers.some(o=>o.number==='OP18-021'&&!o.verified),id);
  }
});
test('tierone sold-out item cannot inherit inventory from the next card or commented cart controls',()=>{
  const offers=parsed('tierone'),sold=offers.find(o=>o.number==='EB05-010');
  assert.equal(sold.price,128000);assert.equal(sold.stock,'out');assert.equal(sold.stockQuantity,0);assert.equal(sold.verified,false);
});
test('fukufuku hidden sold-out price is parsed only from its own unambiguous JSON SKU and explicitly labeled',()=>{
  const offers=parsed('fukufuku'),sold=offers.find(o=>o.number==='ST22-001'&&o.stock==='out');
  assert.equal(sold.price,580);assert.equal(sold.priceSource,'embedded-reference');assert.equal(sold.stockQuantity,0);
  assert.match(priceSourceNote(sold),/非表示/);
  assert.match(offerTable([{shop:{name:'福福トレカ'},offer:{...sold,observedAt:new Date().toISOString()},fresh:true}]),/非表示/);
  const shop=config.shops.find(s=>s.id==='fukufuku');
  // Use a search result (no conflicting OP18 category) for the ST22 estimate.
  const raw=parsePage(shop,fixtures.fukufuku,shop.origin+'/products/list?name=ST22-001').offers.find(o=>o.priceSource);
  const quote=priceDeck([{number:'ST22-001',quantity:1}],{policy:config.policy,offers:[{...raw,...identify(raw,shop,shop.origin),id:'fukufuku:sold',shopId:shop.id,observedAt:new Date().toISOString()}]});
  assert.equal(quote.pricedQuantity,0);assert.equal(quote.total,null);assert.equal(quote.referenceTotal,580);
  assert.equal(parsed('fukufuku',fixtures.fukufuku.replace('"stock_find":false','"stock_find":true')).filter(o=>o.priceSource).length,0);
  assert.equal(parsed('fukufuku',fixtures.fukufuku.replace(/<script>[\s\S]*?<\/script>/,'<script>eccube.productsClassCategories = {bad: execute()};</script>')).filter(o=>o.priceSource).length,0);
});
test('torecolo damaged and play-use cards and unknown product suffixes never qualify as standard',()=>{
  const offers=parsed('torecolo');assert.ok(offers.some(o=>o.condition==='damaged'&&!o.verified));
  const played=parsed('torecolo',fixtures.torecolo.replaceAll('中古良品','プレイ用'));
  assert.ok(played.every(o=>!o.verified));
  const unknown=parsed('torecolo',fixtures.torecolo.replaceAll('OP18-021L/','OP18-021L99/'));
  assert.ok(unknown.filter(o=>o.number==='OP18-021').every(o=>!o.verified));
  const sold=parsed('torecolo',fixtures.torecolo.replaceAll('data-stock-count="17"','data-stock-count="0"').replaceAll('在庫 <span>17</span>','在庫 <span>0</span>')).find(o=>o.verified);
  assert.equal(sold.price,10);assert.equal(sold.stock,'out');assert.equal(sold.stockQuantity,0);
});
test('new pagination preserves list boundaries and coverage detects skipped category pages',()=>{
  const s=config.shops.find(s=>s.id==='torecolo'),root=s.origin+s.seeds[0];
  const p2=root.replace(/\/$/,'_p2/'),p3=root.replace(/\/$/,'_p3/');
  assert.equal(listKey(root),listKey(p2));assert.equal(pageNumber(p3),3);
  const html=fixtures.torecolo+`<a href="${p3}">3</a><a href="/shop/goods/search.aspx?page=2">search</a><a href="/shop/c/c10732080_p2/">other series</a>`;
  assert.deepEqual(parsePage(s,html,root).nextPages,[p3]);
  const audit=auditList(s,root,{[root]:{shopId:s.id,observedAt:new Date().toISOString()},[p3]:{shopId:s.id,observedAt:new Date().toISOString()}},{[root]:html,[p3]:fixtures.torecolo});
  assert.deepEqual(audit.missingPages,[2]);assert.equal(audit.knownPagesComplete,false);
  const f=config.shops.find(s=>s.id==='fukufuku'),url=f.origin+'/products/list?category_id=435';
  assert.equal(listKey(url),listKey(url+'&pageno=2'));assert.equal(canonicalPage(url+'&pageno=1'),url);
  assert.deepEqual(parsePage(f,fixtures.fukufuku+'<a href="/products/list?category_id=435&amp;pageno=2">2</a><a href="/products/list?category_id=397&amp;pageno=2">other</a>',url).nextPages,[url+'&pageno=2']);
});
test('torecolo configuration avoids the robots-disallowed search route',async()=>{
  const s=config.shops.find(s=>s.id==='torecolo');assert.equal(s.cardSearch,undefined);
  const robots=await readFile(new URL('./fixtures/torecolo-robots.txt',import.meta.url),'utf8');
  assert.equal(robotsPolicy(robots,'/shop/goods/search.aspx?keyword=OP18-021').allowed,false);
  for(const seed of s.seeds)assert.equal(robotsPolicy(robots,seed).allowed,true);
});
