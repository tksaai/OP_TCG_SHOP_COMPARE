import {clean,field,match,price,absolute,inventory} from './html.mjs';
// Read the store's JSON literal without executing any downloaded JavaScript.
function classes(html){
  const start=html.indexOf('eccube.productsClassCategories');if(start<0)return {};
  const begin=html.indexOf('{',start);if(begin<0)return {};
  let depth=0,quoted=false,escaped=false;
  for(let i=begin;i<html.length;i++){
    const c=html[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;
    else if(c==='{')depth++;
    else if(c==='}'&&--depth===0){try{return JSON.parse(html.slice(begin,i+1));}catch{return {};}}
  }
  return {};
}
export default function parse(html,url){
  const data=classes(html);
  return html.split(/<li\b[^>]*class="[^"]*\bproduct-list__item(?=\s|")[^"]*"[^>]*>/i).slice(1).map(raw=>{
    const b=raw.split('</li>')[0],name=field(b,'h2','product-list__item__title');
    const productUrl=absolute(match(name,/href="([^"<>]*\/products\/detail\/\d+)"/),url);
    const id=productUrl.match(/\/(\d+)$/)?.[1];
    const out=/品切れ|売り切れ/.test(clean(field(b,'div','product-list__item__message')));
    const quantity=match(b,/<span>\s*\/\s*([\d,]+)\s*<\/span>/);
    const stock=inventory(quantity?`在庫 ${quantity}`:'',{soldout:out});
    let amount=price(field(b,'td','product-list__item__table--price')),priceSource;
    if(!amount&&out){
      const leaves=Object.values(data[id]||{}).flatMap(v=>Object.values(v||{})).filter(v=>v?.product_class_id);
      // A hidden value is usable only for one unambiguous, explicitly sold-out SKU.
      if(leaves.length===1&&leaves[0].stock_find===false){amount=price(leaves[0].price02_inc_tax);if(amount)priceSource='embedded-reference';}
    }
    return {title:clean(name),model:'',price:amount,url:productUrl,...stock,...(priceSource?{priceSource}:{})};
  });
}
