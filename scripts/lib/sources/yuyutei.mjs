import {clean,field,match,price,absolute,inventory} from './html.mjs';
export default function parse(html,url){
  return html.split(/<div\s+class="card-product\b/i).slice(1).map(raw=>{
    // Limit evidence to this product, excluding footer/recommendation cards after the grid.
    const b=raw.split(/<div\s+class="py-4 cards-list/)[0];
    const alt=clean(match(b,/alt="((?:OP|ST|EB|PRB|P)[\d-]+[^"<>]*)"/));
    const title=alt||clean(field(b,'h4','text-primary'));
    const model=clean(match(b,/<span\s+class="d-block border border-dark[^>]*>([\s\S]*?)<\/span>/));
    const stockText=field(b,'label','cart_sell_zaiko');
    return {title,model,price:price(match(b,/<strong[^>]*>([\s\S]*?)<\/strong>/)),...inventory(stockText,{soldout:/^[^"]*\bsold-out\b/.test(raw)}),url:absolute(match(b,/href="([^"]*\/sell\/opc\/card\/[^"<>]+)"/),url)};
  });
}
