import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDbCatalog} from '../scripts/lib/db-catalog.mjs';
import {nextCatalogLookup} from '../scripts/lib/catalog-lookup.mjs';
import {identify} from '../scripts/lib/identity.mjs';
import {groupOffers} from '../public/compare.js';
import {matchesCatalogGroup,catalogSeries} from '../public/catalog-search.js';
import {cardLookup} from '../public/shop-search.js';
const cards=[{cardNumber:'ST36-005',cardName:'ユースタス・キッド',furigana:'ユースタスキッド',getInfo:'デッキ【ST-36】'},{cardNumber:'PRB02-002',cardName:'トラファルガー・ロー'},{cardNumber:'OP01-006',cardName:'お玉'},{cardNumber:'DON-001',cardName:'ドン!!'},{cardNumber:'P',cardName:'未確定'}];
const manifest={cards:{'OP01-006':[{getInfo:'THE BEST【PRB-01】'},{getInfo:'スタートデッキ【ST-01】'}]}};
const master={entries:{PRB01:{label:'THE BEST【PRB-01】'},PRB02:{label:'THE BEST vol.2【PRB-02】'},ST36:{label:'黄 キッド【ST-36】'},ST01:{label:'麦わら【ST-01】'},P:{label:'プロモーションカード'}}};
const shop={id:'a',origin:'https://example.com',cardSearch:{path:'/product-list',parameter:'keyword'}};

test('DB catalog includes unpriced ST/PRB, reprint membership, and preserves local images',()=>{
 const {catalog,info}=buildDbCatalog(cards,manifest,master,{'ST36-005':{image:'images/ST36-005.webp'}});
 assert.equal(info.sourceCards,3);assert.equal(info.excludedCards,2);assert.deepEqual(info.excludedNumbers,['P']);
 assert.equal(catalog['ST36-005'].image,'images/ST36-005.webp');
 assert.deepEqual(catalog['OP01-006'].series,['OP01','PRB01','ST01']);
 assert.ok(catalog['OP01-006'].seriesLabels.includes('THE BEST【PRB-01】'));
 assert.ok(!catalog['DON-001']);assert.ok(!catalog.P);
 assert.throws(()=>buildDbCatalog([...cards,cards[0]],manifest,master),/重複/);
});
test('search displays catalog-only cards without fabricating prices or merging prints',()=>{
 const {catalog}=buildDbCatalog(cards,manifest,master);
 const separate={key:'OP01-006:unverified:a:1',number:'OP01-006',title:'お玉 PRB再録',edition:'PRB01',variant:'special',verified:false,shopId:'a',price:50};
 const groups=groupOffers({offers:[separate]},catalog),st=groups.find(g=>g.number==='ST36-005');
 assert.equal(st.catalogOnly,true);assert.deepEqual(st.offers,[]);
 assert.equal(matchesCatalogGroup(st,{terms:['キッド']}),true);
 assert.equal(matchesCatalogGroup(st,{terms:['ST36-005']}),true);
 assert.equal(matchesCatalogGroup(st,{terms:['ユースタスキッド'],edition:'ST36'}),true);
 const normal=groups.find(g=>g.key==='OP01-006:normal:ja:standard');
 assert.equal(matchesCatalogGroup(normal,{edition:'PRB01'}),true);assert.equal(matchesCatalogGroup(normal,{terms:['PRB01']}),true);
 assert.equal(matchesCatalogGroup(normal,{variant:'parallel'}),false);
 assert.deepEqual(normal.offers,[]);assert.deepEqual(groups.find(g=>g.key===separate.key).offers,[separate]);
 assert.ok(catalogSeries(groups,{series:[{id:'PRB03',label:'未取得シリーズ'}]}).some(s=>s.id==='PRB03'));
});
test('PRB native normal cards are verified but explicit reprints and parallels stay isolated',()=>{
 const raw={title:'トラファルガー・ロー【SR】{PRB02-002}',url:'https://example.com/product/1',model:''};
 const normal=identify(raw,shop,shop.origin);assert.equal(normal.key,'PRB02-002:normal:ja:standard');assert.equal(normal.verified,true);
 for(const title of ['ロー パラレル PRB02-002','ロー PRB02-002【PRB02】','ロー PRB02-002 状態B','お玉 OP01-006 PRB01','ロー PRB02-002 英語版'])assert.equal(identify({...raw,title},shop,shop.origin).verified,false,title);
 assert.equal(identify({...raw,title:'キッド ST36-005'},shop,shop.origin).verified,true);
});
test('DB rotation chooses one target, rotates family/series/card, and respects verified search routes',()=>{
 const catalog=Object.fromEntries(['PRB01-001','PRB02-002','ST01-001','ST02-001','P-001','EB01-001','OP01-001','OP01-002'].map(n=>[n,{db:true}]));
 const state={},selected=[];
 for(let i=0;i<8;i++){
  const next=nextCatalogLookup(shop,catalog,state);selected.push(next.number);state[next.url]={checkedAt:100+i};
 }
 assert.deepEqual(selected.slice(0,5),['PRB01-001','ST01-001','P-001','EB01-001','OP01-001']);
 assert.equal(selected[5],'PRB02-002');assert.equal(selected[6],'ST02-001');
 assert.equal(nextCatalogLookup({...shop,cardSearch:undefined,seriesSeeds:{}},catalog,state),null);
 const category={...shop,cardSearch:undefined,seriesSeeds:{ST02:['/product-group/2']}};
 assert.equal(nextCatalogLookup(category,catalog,state).url,'https://example.com/product-group/2');
 const omitted=Object.keys(catalog).map(n=>cardLookup(shop,n).url);assert.equal(nextCatalogLookup(shop,catalog,state,omitted),null);
 assert.equal(nextCatalogLookup(shop,{...catalog,'PRB00-001':{db:false}},{}).number,'PRB01-001');
});
test('committed DB catalog covers ST/PRB/proxy series and auto collection keeps access limits',async()=>{
 const read=async file=>JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'));
 const catalog=await read('../public/data/catalog.json'),info=await read('../public/data/catalog-info.json');
 assert.ok(Object.values(catalog).filter(c=>c.db).length>=3000);
 for(const n of ['ST36-005','PRB02-002','P-001'])assert.equal(catalog[n].db,true);
 assert.ok(catalog['OP01-006'].series.includes('PRB01'));assert.ok(info.series.some(s=>s.id==='ST36'));
 const {policy}=await read('../config/shops.json');assert.equal(policy.maxPagesPerShopPerRun,5);assert.equal(policy.maxRequestsPerShopPerDay,20);assert.ok(policy.minIntervalMs>=10000);
});
