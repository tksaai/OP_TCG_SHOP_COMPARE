import {clean,field,match,price,absolute,inventory} from './html.mjs';
export default function parse(html,url){
  return html.replace(/<!--[\s\S]*?-->/g,'').split(/<li\b[^>]*>/i).slice(1).map(raw=>{
    const b=raw.split('</li>')[0],name=field(b,'p','item-name');
    const category=clean(field(b,'p','item-category'));
    const sourceSeries=category.match(/\b(OP|EB|ST|PRB)-?(\d{2})\b/i);
    return {title:clean(name),model:'',price:price(match(clean(field(b,'p','price')),/[￥¥]\s*([\d,]+)/)),
      url:absolute(match(name,/href="([^"<>]*\/view\/item\/\d+[^"<>]*)"/),url),
      ...inventory(b),...(sourceSeries?{sourceSeries:sourceSeries[1].toUpperCase()+sourceSeries[2]}:{})};
  });
}
