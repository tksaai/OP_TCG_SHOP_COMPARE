import {cartListings,cartOffer,inventory} from './html.mjs';
// Card Rush: card number in goods_name, actual quantity in p.stock (枚).
export default function parse(html,url){return cartListings(html,url).map(p=>cartOffer(p,inventory(p.stockText,{buyable:p.buyable,soldout:p.soldout})));}
