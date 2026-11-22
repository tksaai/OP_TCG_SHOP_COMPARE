import {clean,field,match,price,absolute,inventory} from './html.mjs';
export default function parse(html,url){
  return html.split(/<(?:div|li)\s+class="product-card(?:\s[^"]*)?"[^>]*>/i).slice(1).map(b=>{
    // Sale amount takes precedence over the crossed-out regular amount.
    const sale=field(b,'span','product-card__price-sale'),regular=field(b,'span','product-card__price-regular');
    const title=clean(field(b,'p','product-card__name'));
    return {title,model:'',price:price(sale||regular),...inventory(field(b,'div','product-card__stock')),url:absolute(match(b,/href="([^"<>]*\/view\/item\/[^"<>]+)"/),url)};
  });
}
