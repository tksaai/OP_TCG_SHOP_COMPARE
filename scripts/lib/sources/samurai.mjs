import {cartListings,cartOffer,inventory} from './html.mjs';
// Torezamu titles contain rarity + card number in parentheses; the numeric model is a SKU.
export default function parse(html,url){return cartListings(html,url).map(p=>({...cartOffer(p,inventory(p.stockText,{buyable:p.buyable,soldout:p.soldout})),identityText:p.title}));}
