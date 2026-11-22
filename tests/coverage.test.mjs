import test from 'node:test';import assert from 'node:assert/strict';
import {auditCoverage,auditList,discoverSeries} from '../scripts/lib/coverage.mjs';
const shop={id:'s',name:'Test',origin:'https://example.com',adapter:'cart',enabled:true,seeds:['/product-group/18'],seriesSeeds:{OP18:['/product-group/18']}};
const root=shop.origin+'/product-group/18';
const item='<li class="list_item_cell"><a href="/product/1"><span class="goods_name">OP18-001 カルー</span><p class="selling_price">100円(税込)</p></a></li>';
const page={shopId:'s',observedAt:new Date().toISOString(),offers:[{}]};
test('coverage does not mistake one incidental product for complete series collection',()=>{
 const r=auditCoverage({config:{shops:[shop],policy:{staleAfterHours:36}},catalog:{series:[{id:'OP01'},{id:'OP18'}]},pages:{[root]:page},htmlByUrl:{[root]:item},snapshot:{offers:[{shopId:'s',edition:'OP01',number:'OP01-001'}]}});
 assert.equal(r.rows[0].status,'not_configured');assert.equal(r.rows[0].offerCount,1);assert.equal(r.summary.allSeriesCheckPassed,false);
});
test('coverage detects gaps between pagination links including skipped middle pages',()=>{
 const r=auditList(shop,root,{[root]:page,[root+'?page=5']:page},{[root]:item+'<a href="?page=5">最後</a>',[root+'?page=5']:item});
 assert.deepEqual(r.missingPages,[2,3,4]);assert.equal(r.knownPagesComplete,false);
});
test('registered but unvisited series and paused shops cannot pass',()=>{
 const r=auditCoverage({config:{shops:[shop,{...shop,id:'off',enabled:false}],policy:{staleAfterHours:36}},catalog:{series:[{id:'OP18'}]},pages:{},htmlByUrl:{},snapshot:{offers:[]}});
 assert.equal(r.rows[0].status,'not_collected');assert.equal(r.rows[1].status,'paused');assert.equal(r.summary.allSeriesCheckPassed,false);
});
test('shop navigation identifies series by observed labels rather than guessed category IDs',()=>{
 const d=discoverSeries(shop,['<a href="/product-group/23">【EB-05】Heroines</a><a href="/product/99">OP01-001</a>']);
 assert.deepEqual(d.EB05,['https://example.com/product-group/23']);assert.equal(d.OP01,undefined);
});
test('configured literal series URLs count as registered even when nav labels omit the code',()=>{
 const s={...shop,seeds:['/sell/opc/s/op01'],seriesSeeds:{}};
 const d=discoverSeries(s,[]);assert.deepEqual(d.OP01,['https://example.com/sell/opc/s/op01']);
 const r=auditCoverage({config:{shops:[s],policy:{staleAfterHours:36}},catalog:{series:[{id:'OP01'}]},pages:{},htmlByUrl:{},snapshot:{offers:[]}});
 assert.equal(r.rows[0].status,'not_collected');assert.equal(r.summary.unconfiguredSeries.length,0);
});
