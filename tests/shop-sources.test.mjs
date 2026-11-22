import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePage} from '../scripts/lib/adapters.mjs';
import {identify} from '../scripts/lib/identity.mjs';
const config=JSON.parse(await readFile(new URL('../config/shops.json',import.meta.url),'utf8'));
// Prices, quantities and IDs verified against each saved product's visible source fields.
const expected={
  cardrush:{price:50,stock:'in',stockQuantity:270,number:'OP18-001',productId:'16085'},
  yuyutei:{price:3980,stock:'out',stockQuantity:0,number:'OP18-118',productId:'/sell/opc/card/op18/10148'},
  fullahead:{price:108000,stock:'in',stockQuantity:2,number:'OP18-060',productId:'000000011905'},
  raftel:{price:138000,stock:'in',stockQuantity:null,number:'OP17-079',productId:'13461'},
  mercard:{price:498000,stock:'in',stockQuantity:1,number:'OP18-065',productId:'12605'},
  samurai:{price:180,stock:'in',stockQuantity:null,number:'OP18-048',productId:'36593'},
  onehappy:{price:2280,stock:'in',stockQuantity:2,number:'OP18-001',productId:'000000007400'},
};
for(const [id,want]of Object.entries(expected))test(`${id}: actual storefront fixture price, inventory and card identity`,async()=>{
  const shop=config.shops.find(s=>s.id===id),url=new URL(id==='raftel'?'/product-list/372':shop.seriesSeeds.OP18[0],shop.origin).href;
  const html=await readFile(new URL(`./fixtures/${id}.html`,import.meta.url),'utf8');
  const p=parsePage(shop,html,url).offers;assert.equal(p.length,1);
  for(const k of ['price','stock','stockQuantity','productId'])assert.equal(p[0][k],want[k],k);
  assert.equal(identify(p[0],shop,url).number,want.number);
  if(id!=='raftel')assert.equal(p[0].sourceSeries,'OP18');
});
test('samurai: SOLD OUT overlay and absent cart are recognized as out of stock',async()=>{
  const shop=config.shops.find(s=>s.id==='samurai');
  const html='<li class="list_item_cell"><a href="/product/36591"><span class="goods_name">Mr.0&amp;ミス・オールサンデー(SR)(OP18-046)</span><p class="selling_price">280円(税込)</p><div data-src="https://www.torezamunet.com/data/torezamunet/_/3230323600534f4c44204f5554007400.jpg"></div></a></li>';
  const o=parsePage(shop,html,shop.origin+'/product-list/691').offers[0];assert.equal(o.stock,'out');assert.equal(o.stockQuantity,0);
});
test('yuyutei: missing alt still gets number from the separate card-number span',async()=>{
  const shop=config.shops.find(s=>s.id==='yuyutei'),html=(await readFile(new URL('./fixtures/yuyutei.html',import.meta.url),'utf8')).replace(/alt="OP18[^"<>]*"/g,'alt=""');
  const o=parsePage(shop,html,shop.origin+'/sell/opc/s/op18').offers[0];assert.equal(identify(o,shop,shop.origin).number,'OP18-118');assert.equal(o.stock,'out');
});
test('onehappy: discounted sale amount wins over regular amount; zero quantity stays sold out',()=>{
  const shop=config.shops.find(s=>s.id==='onehappy');
  const html='<div class="product-card"><p class="product-card__name"><a href="/view/item/123">カルー OP18-001</a></p><span class="product-card__price-regular">￥3,000</span><span class="product-card__price-sale">￥2,000</span><div class="product-card__stock">在庫 0 個</div><button>カートに入れる</button></div>';
  const o=parsePage(shop,html,shop.origin+'/view/category/OP18_ALL').offers[0];assert.equal(o.price,2000);assert.equal(o.stock,'out');
});
test('fullahead: footer cart text cannot make an unknown-stock product available',()=>{
  const shop=config.shops.find(s=>s.id==='fullahead');
  const html='<a href="/shopdetail/123/opc-op18/page1/recommend/"><span class="itemName">OP18-001 カルー L</span></a><span class="itemPrice"><strong>100円</strong>(税込)</span><div class="item-add-basket"></div><footer>カートに入れる</footer>';
  assert.equal(parsePage(shop,html,shop.origin+'/shopbrand/opc-op18/').offers[0].stock,'unknown');
});
test('treasure/special prints and MMA artwork variants never merge into regular cheapest price',()=>{
  const s=config.shops.find(s=>s.id==='cardrush');
  for(const title of ['【トレジャーレア】OP18-064 キリンガム聖 UC','キリンガム聖(TR/★UC)(OP18-064)','【スペシャルカード】OP18-084 軍子宮 SR','MMA「R」(黒)[OP18-093]','MMA(中央) OP18-093']){
    const o=identify({title,model:'',url:s.origin+'/product/1',sourceSeries:'OP18'},s,s.origin);assert.equal(o.verified,false,title);
  }
  const o=identify({title:'【SP】OP17-119 ロキ',model:'',url:s.origin+'/product/2',sourceSeries:'OP18'},s,s.origin);assert.equal(o.number,'OP17-119');assert.equal(o.edition,'OP18');assert.equal(o.verified,false);
});
test('same makeshop product under two category URLs has one stable product ID',()=>{
  const s=config.shops.find(s=>s.id==='fullahead');
  const block=url=>`<a href="${url}"><span class="itemName">OP18-001 カルー L</span></a><span class="itemPrice"><strong>100円</strong>残りあと1個</span><div class="item-add-basket"></div>`;
  const p=parsePage(s,block('/shopdetail/123/opc-op18/page1/recommend/')+block('/shopdetail/123/onepiece/page1/recommend/'),s.origin+'/shopbrand/opc-op18/');assert.equal(p.offers.length,1);assert.equal(p.offers[0].productId,'123');
});
