export function clean(value=''){
  return String(value).replace(/<[^>]*>/g,' ').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&(amp|lt|gt|quot|apos|nbsp|yen);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',yen:'¥'}[k])).replace(/\s+/g,' ').trim();
}
export const match=(s,re)=>s.match(re)?.[1]||'';
export function field(html,tag,cls){return match(html,new RegExp(`<${tag}\\b[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`,'i'));}
export function price(text){const m=clean(text).normalize('NFKC').match(/(?:[¥￥]\s*)?([\d,]+)\s*(?:円|$)/);const n=m?Number(m[1].replace(/,/g,'')):NaN;return Number.isSafeInteger(n)&&n>0?n:null;}
export function absolute(href,base){try{const u=new URL(clean(href),base);return u.protocol==='https:'&&u.origin===new URL(base).origin?u.href:'';}catch{return '';}}
export function inventory(text,{buyable=false,soldout=false}={}){
  const t=clean(text).normalize('NFKC');
  const n=t.match(/(?:在庫(?:数)?\s*[:：]?|残り(?:あと)?)\s*([\d,]+)\s*(?:枚|個|点)?/);
  const quantity=n?Number(n[1].replace(/,/g,'')):null;
  const isOut=soldout||/SOLD\s*OUT|売り切れ|品切れ|在庫\s*[:：]?\s*[×✕]/i.test(t)||quantity===0;
  return {stock:isOut?'out':quantity>0||/在庫\s*[:：]?\s*[○◯◎]/.test(t)||buyable?'in':'unknown',stockQuantity:isOut?0:quantity};
}
export function cartListings(html,pageUrl){
  return html.split(/<li\b[^>]*class="[^"]*\blist_item_cell\b[^>]*>/i).slice(1).map(raw=>{
    const block=raw.split('</li>')[0];
    const buttons=[...block.matchAll(/<(?:input|button)\b[^>]*class="[^"]*\bcartinput\b[^>]*>/gi)].map(m=>m[0]);
    // This storefront encodes the SOLD OUT overlay in the hex image filename.
    const imageSoldout=/(?:data-src|src)="[^"\s]*534f4c44204f5554[^"\s]*"/i.test(block);
    return {title:clean(field(block,'span','goods_name')),model:clean(field(block,'span','model_number_value')),price:price(field(block,'p','selling_price')),stockText:field(block,'p','stock'),buyable:buttons.some(b=>!(/\bdisabled\b|soldout|sold-out/i.test(b))),soldout:imageSoldout||/SOLD\s*OUT|売り切れ|品切れ/i.test(clean(block)),url:absolute(match(block,/href="([^"]*\/product\/\d+[^"]*)"/),pageUrl)};
  });
}
export function cartOffer(item,stock){const {title,model,price,url}=item;return {title,model,price,url,...stock};}
