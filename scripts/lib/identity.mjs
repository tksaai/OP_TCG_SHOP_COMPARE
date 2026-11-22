import { clean } from './adapters.mjs';
export function identify(offer, shop, pageUrl, overrides = {}) {
  const raw = clean(offer.identityText||`${offer.title} ${offer.model}`).normalize('NFKC');
  const number = raw.match(/\b((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})\b/i)?.[1]?.toUpperCase();
  if (!number || /\d+枚セット|デッキ販売|オリパ|未開封BOX|未開封パック|PSA|ARS\d|鑑定済|福袋/i.test(raw)) return null;
  const condition = raw.match(/状態\s*([ABC][+-]?)/i)?.[1]?.toUpperCase() || 'standard';
  const language = /英語|English|海外|中国|Asia/i.test(raw) ? 'foreign' : 'ja';
  const variant = /スーパー|コミック|漫画絵/i.test(raw) ? 'super' : /パラレル|\bP-(?:L|SR|SEC|R|UC|C)\b|\b(?:SR|SEC|L|R)\/P\b/.test(raw) ? 'parallel' : /\b(?:SP|TR)\b|スペシャル|トレジャー|プロモ|再録|PRB|特別|金箔|金文字|foil|JUDGE|CS\d|ロゴ|ベストセレクション|プレミアム|フルアート|アニメ|周年|手配書|赤白版|修正|エラッタ|未開封|大会|優勝|フラッグ|チャンピオン|フルパラ/i.test(raw) ? 'special' : 'normal';
  const cardSeries = number.split('-')[0];
  // Autogroup only unambiguous original normal prints. Explicit reprint series remain isolated.
  const sourceEdition = offer.sourceSeries||pageUrl.match(/\/(?:s|card)\/((?:op|eb|st|prb)\d+)/i)?.[1]?.toUpperCase();
  const edition=sourceEdition||cardSeries;
  const hasOtherEdition = [...raw.matchAll(/\b((?:OP|ST|EB|PRB)-?\d{2})\b/gi)].some(m => m[1].replace('-', '').toUpperCase() !== cardSeries);
  // OP18-093 has three regular artworks. Stores describe them by text or left/center/right.
  // Without a reviewed image mapping, even an unlabeled listing is ambiguous.
  const multiArtwork=number==='OP18-093'||/絵柄|セリフ|左側|右側|中央/.test(raw);
  const safe = variant === 'normal' && !multiArtwork && language === 'ja' && condition === 'standard' && !hasOtherEdition && (!sourceEdition || sourceEdition === cardSeries) && !/illust[:.]|イラスト|箔|加工|付録|限定|記念|応募|プロモーション|セレクション/.test(raw);
  const custom = overrides[`${shop.id}:${new URL(offer.url).pathname}`];
  const key = custom?.key || (safe ? `${number}:normal:ja:standard` : `${number}:unverified:${shop.id}:${offer.productId||new URL(offer.url).pathname}`);
  return { key, number, variant: custom?.variant || variant, edition, condition, language, verified: Boolean(custom) || safe, label: custom?.label || (safe ? '通常版' : '版・状態を要確認') };
}
