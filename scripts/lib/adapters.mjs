// Every adapter is pure: HTML in, offers + allowed next pages out. Network policy lives elsewhere.
export function clean(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&(amp|lt|gt|quot|apos|nbsp|yen);/g, (_, k) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',yen:'¥'}[k]))
    .replace(/\s+/g, ' ').trim();
}
const match = (s, re) => s.match(re)?.[1] || '';
const money = s => { const n = Number(clean(s).replace(/[^\d]/g, '')); return n > 0 && Number.isSafeInteger(n) ? n : null; };
function absolute(href, base) { try { const u = new URL(clean(href), base); return u.origin === new URL(base).origin && u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
function stockOf(s, buyMarker = /カートに入れる/) {
  const t = clean(s);
  if (/SOLD\s*OUT|sold-out|売り切れ|品切れ|在庫\s*[:：]?\s*[×✕]|在庫(?:数)?\s*0\s*(?:枚|個|点)/i.test(t) || /class="[^"]*sold-out/.test(s)) return 'out';
  return /在庫(?:数)?\s*[:：]?\s*(?:[1-9][\d,]*|[○◯◎])|残り(?:あと)?\s*[1-9]/.test(t) || buyMarker.test(s) ? 'in' : 'unknown';
}
function cart(html, pageUrl) {
  return html.split(/<li\b[^>]*class="[^"]*\blist_item_cell\b[^>]*>/i).slice(1).map(b => {
    b = b.split('</li>')[0];
    const title = clean(match(b, /<span class="goods_name">([\s\S]*?)<\/span>/));
    const model = clean(match(b, /<span class="model_number_value">([\s\S]*?)<\/span>/));
    const priceBlock = match(b, /<p class="selling_price">([\s\S]*?)<\/p>/);
    return { title, model, price: money(priceBlock), stock: stockOf(b), url: absolute(match(b, /href="([^"]*\/product\/\d+[^"]*)"/), pageUrl) };
  });
}
function yuyutei(html, pageUrl) {
  return html.split(/<div\s+class="card-product\b/i).slice(1).map(b => {
    const alt = clean(match(b, /alt="((?:OP|ST|EB|PRB|P)[\d-]+[^"<>]*)"/));
    return { title: alt || clean(match(b, /<h4[^>]*>([\s\S]*?)<\/h4>/)), model: '', price: money(match(b, /<strong[^>]*>([\s\S]*?)<\/strong>/)), stock: stockOf(b, /class="btn btn-primary cart_sell_in/), url: absolute(match(b, /href="([^"]*\/sell\/opc\/card\/[^"<>]+)"/), pageUrl) };
  });
}
function makeshop(html, pageUrl) {
  return html.split(/<a\s+href="(?=\/shopdetail\/)/i).slice(1).map(b => {
    // A product block ends before the next product; the list footer has no cart marker.
    const title = clean(match(b, /class="itemName">([\s\S]*?)<\/span>/));
    const price = money(match(b, /class="itemPrice">\s*<strong>([\s\S]*?)<\/strong>/));
    return { title, model:'', price, stock: stockOf(b), url: absolute(b.split('"')[0], pageUrl) };
  });
}
function onehappy(html, pageUrl) {
  return html.split(/<(?:div|li)\s+class="product-card(?:\s[^"]*)?"[^>]*>/i).slice(1).map(b => {
    const title = clean(match(b, /class="product-card__name">([\s\S]*?)<\/p>/));
    return { title, model:'', price: money(match(b, /class="product-card__price-(?:regular|sale)"[^>]*>([\s\S]*?)<\/span>/)), stock: stockOf(b), url: absolute(match(b, /href="([^"<>]*\/view\/item\/[^"<>]+)"/), pageUrl) };
  });
}
export const adapters = { cart, yuyutei, makeshop, onehappy };
export function parsePage(shop, html, pageUrl) {
  if (/安全な接続を確認|Just a moment|cf-chl-|captcha/i.test(html)) throw new Error('アクセス確認画面を検出');
  const adapter = adapters[shop.adapter];
  if (!adapter) throw new Error(`未対応アダプター: ${shop.adapter}`);
  const offers = adapter(html, pageUrl).filter(x => x.title && x.price && x.url && /(?:OP|ST|EB|PRB|P)-?\d{1,3}-\d{2,3}|\bP-\d{3}/i.test(`${x.title} ${x.model}`));
  const nextPages = [];
  for (const m of html.matchAll(/<(?:a|link)\b[^>]*>/gi)) {
    const tag = m[0], href = absolute(match(tag, /href="([^"]+)"/), pageUrl);
    if (!href) continue;
    const u = new URL(href), current = new URL(pageUrl);
    // Only pagination within this exact list; never follow arbitrary detail or cart links.
    const samePath = u.pathname === current.pathname;
    const msPath = u.pathname.replace(/\/page\d+\/[^/]+\/?$/, '/');
    const currentMs = current.pathname.replace(/\/page\d+\/[^/]+\/?$/, '/');
    if ((samePath && u.searchParams.has('page') && /^\d+$/.test(u.searchParams.get('page'))) || (msPath === currentMs && /\/page\d+\//.test(u.pathname))) nextPages.push(href);
  }
  return { offers: [...new Map(offers.map(x => [x.url, x])).values()], nextPages: [...new Set(nextPages)].slice(0, 100) };
}
