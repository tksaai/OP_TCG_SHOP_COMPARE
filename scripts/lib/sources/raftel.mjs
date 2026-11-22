import {cartListings,cartOffer,inventory} from './html.mjs';
// Raftel often omits the stock count on list pages; a live cartinput is positive evidence.
// model_number_value is a shop SKU, not a ONE PIECE card number. Retain it for traceability.
export default function parse(html,url){return cartListings(html,url).map(p=>cartOffer(p,inventory(p.stockText,{buyable:p.buyable,soldout:p.soldout})));}
