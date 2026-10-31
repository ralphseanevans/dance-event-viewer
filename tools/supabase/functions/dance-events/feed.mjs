export const FIELDS = ['key','name','style','type','day_of_week','monthly_rule','exclude_monthly_rules','exclude_dates','start_date','end_date','start_time','end_time','venue','state','cost','source_url','unverified','verified_on','added_on','added_by','canceled_dates','cancel_status'];
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store', 'Surrogate-Control': 'no-store',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
};
export function createHandler({ url, publishableKey, fetcher = fetch, now = () => new Date() }) {
  return async request => {
    const respond = (body, status = 200, extra = {}) => new Response(request.method === 'HEAD' ? null : body, {status, headers: {...headers, ...extra}});
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (!['GET','HEAD'].includes(request.method)) return respond(JSON.stringify({error:'Read-only endpoint'}),405,{Allow:'GET, HEAD, OPTIONS'});
    const format = new URL(request.url).searchParams.get('format') || 'json';
    if (!['json','text'].includes(format)) return respond(JSON.stringify({error:'Supported formats: json, text'}),400);
    try {
      if (!url || !publishableKey) throw new Error('configuration');
      const events = [], keys = new Set();
      const signal = AbortSignal.timeout(25000);
      for (let page = 0; ; page++) {
        if (page >= 100) throw new Error('feed limit');
        const endpoint = new URL('/rest/v1/event_listings',url);
        endpoint.searchParams.set('select',FIELDS.join(','));
        endpoint.searchParams.set('order','key.asc');
        endpoint.searchParams.set('limit','500');
        endpoint.searchParams.set('offset',String(page * 500));
        const response = await fetcher(endpoint,{signal,cache:'no-store',headers:{apikey:publishableKey,'Accept-Profile':'public','Cache-Control':'no-cache'}});
        if (!response.ok) throw new Error('upstream');
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('invalid response');
        for (const row of rows) {
          if (!row || typeof row.key !== 'string' || keys.has(row.key) || FIELDS.some(field=>!Object.hasOwn(row,field))) throw new Error('invalid row');
          keys.add(row.key);
          events.push(Object.fromEntries(FIELDS.map(field=>[field,row[field]])));
        }
        if (rows.length < 500) break;
      }
      const body = {generated_at:now().toISOString(),timezone:'America/Chicago',event_count:events.length,events};
      return respond(JSON.stringify(body,null,2),200,{'Content-Type':format==='text'?'text/plain; charset=utf-8':headers['Content-Type'], ...(new URL(request.url).pathname.endsWith('/dance_events_live.json') ? {'Content-Disposition':'attachment; filename="dance_events_live.json"'} : {})});
    } catch {
      return respond(JSON.stringify({error:'Live event data is temporarily unavailable. No cached snapshot was served.'}),503,{'Retry-After':'60'});
    }
  };
}
