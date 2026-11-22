// A list's page URL may vary; its identity keeps every non-pagination parameter.
export function canonicalPage(value) {
  const url=new URL(value);
  url.hash='';
  if(url.searchParams.get('page')==='1')url.searchParams.delete('page');
  url.pathname=url.pathname.replace(/\/page1\/[^/]+\/?$/, '/');
  url.searchParams.sort();
  return url.href;
}
export function listKey(value) {
  const url=new URL(canonicalPage(value));
  url.searchParams.delete('page');
  url.pathname=url.pathname.replace(/\/page\d+\/[^/]+\/?$/, '/').replace(/\/$/,'')||'/';
  return url.href;
}
export function mergeQueue(previous,seeds) {
  const old=[...new Set(previous.map(canonicalPage))];
  const added=seeds.map(canonicalPage).filter(url=>!old.includes(url));
  return [...new Set([...added,...old])];
}
export function nextPage(queue,visited,roots=null) {
  const keys=roots?.map(listKey);
  const index=queue.findIndex(url=>!visited.has(url)&&(!keys||keys.includes(listKey(url))));
  if(index<0)return null;
  const [url]=queue.splice(index,1);queue.push(url);visited.add(url);return url;
}
export function addDiscovered(queue,urls) {
  // Insert new pages ahead of already visited pages so a small budget fills gaps first.
  const fresh=[...new Set(urls.map(canonicalPage))].filter(url=>!queue.includes(url));
  fresh.sort((a,b)=>pageNumber(a)-pageNumber(b));
  queue.unshift(...fresh);
}
function pageNumber(url){const u=new URL(url);return Number(u.searchParams.get('page')||u.pathname.match(/\/page(\d+)\//)?.[1]||1);}
