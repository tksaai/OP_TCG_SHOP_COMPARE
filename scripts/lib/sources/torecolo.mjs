import {clean,field,match,price,absolute,inventory} from './html.mjs';
export default function parse(html,url){
  return html.split(/<dl\b[^>]*class="[^"]*\bblock-thumbnail-t--goods(?=\s|")[^"]*"[^>]*>/i).slice(1).map(raw=>{
    const b=raw.split('</dl>')[0],name=field(b,'div','block-thumbnail-t--goods-name');
    const productUrl=absolute(match(name,/href="([^"<>]*\/shop\/g\/g[^"<>]+)"/),url);
    const code=productUrl.match(/\/shop\/g\/g([^/]+)\//)?.[1]||'';
    const number=code.match(/^((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})/)?.[1]||'';
    const condition=clean(field(b,'div','variation-name'));
    const conditionHint=/キズ|傷/.test(condition)?'damaged':/プレイ用/.test(condition)?'played':undefined;
    const standardCode=/^(?:(?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})(?:L|SEC|SR|R|UC|C|P)$/.test(code);
    const stockText=field(b,'p','block-products--product-stock');
    const stockCount=match(b,/data-stock-count="(\d+)"/);
    return {title:`${clean(name)}【${number}】${condition}`,model:code,
      price:price(field(b,'div','js-enhanced-ecommerce-goods-price')),url:productUrl,
      ...inventory(stockText||(stockCount?`在庫 ${stockCount}`:''),{soldout:/在庫なし|在庫切れ|SOLD\s*OUT|売り切れ/i.test(clean(stockText))}),
      ...(!standardCode?{forceUnverified:true}:{}),...(conditionHint?{conditionHint}:{})};
  });
}
