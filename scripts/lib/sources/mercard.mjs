import {cartListings,cartOffer,inventory} from './html.mjs';
// Mercard's card number and print description live in model_number_value, not goods_name.
// Keep both fields: dropping the model loses cards and can mix normal/parallel prints.
export default function parse(html,url){return cartListings(html,url).map(p=>({...cartOffer(p,inventory(p.stockText,{buyable:p.buyable,soldout:p.soldout})),identityText:`${p.title} ${p.model}`}));}
