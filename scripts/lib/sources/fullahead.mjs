import {clean,field,match,price,absolute,inventory} from './html.mjs';
export default function parse(html,url){
  return html.split(/<a\s+href="(?=\/shopdetail\/)/i).slice(1).map(b=>{
    const title=clean(field(b,'span','itemName'));
    const stockText=clean(match(b,/class="itemPrice">([\s\S]*?)(?=<div class="item-add-basket"|<\/div>|$)/));
    const cart=field(b,'div','item-add-basket');
    // No footer-wide cart search: a footer/cart label is not proof of this item's stock.
    const buyable=/\bM_lumpAmount\b/.test(cart)&&!/\bdisabled\b/.test(cart);
    return {title,model:'',price:price(match(b,/class="itemPrice">\s*<strong>([\s\S]*?)<\/strong>/)),...inventory(stockText,{buyable,soldout:/SOLD\s*OUT|売り切れ|品切れ/i.test(clean(cart))}),url:absolute(b.split('"')[0],url)};
  });
}
