import {FEED,todayKey,parseDate,searchEvents,timeLabel,escapeHTML as esc,safeURL} from './events.mjs?v=d9627c04';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let events=[],results=[],shown=9,style='all',savedOnly=false,openedEvent=null;
let saved;try{const value=JSON.parse(localStorage.getItem('dev-experience-saved')||'[]');saved=new Set(Array.isArray(value)?value:[])}catch{saved=new Set()}
const formatDate=(key,opts)=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...opts}).format(parseDate(key));
function updateSaved(){ $('#saved-count').textContent=saved.size;try{localStorage.setItem('dev-experience-saved',JSON.stringify([...saved]))}catch{} }
function toggleSaved(key){saved.has(key)?saved.delete(key):saved.add(key);updateSaved();render(false);if(openedEvent===key)updateDialogSave()}
function rangeLabel(e){if(!e.start_time)return'Time not listed';return timeLabel(e.start_time)+(e.end_time?' – '+timeLabel(e.end_time):'')}
function scheduleLabel(e){return scheduleText(e)||(e.type==='weekly_recurring'?'Every '+e.day_of_week:e.type==='monthly_recurring'?e.monthly_rule:'One-time event')}
// Cancel label for this date (same three labels as the main viewer; see ../dance-event-viewer/js/cancel-core.js).
function cancelTag(c){return c?`<span class="gc-cancel-tag gc-cancel-tag--${esc(c.status)}">${esc(c.label)}</span>`:''}
function scheduleText(e){return e.type==='biweekly_recurring'?'Every other '+e.day_of_week:e.type==='monthly_recurring'&&/^\s*\d{1,2}(st|nd|rd|th)?\s*$/i.test(e.monthly_rule||'')?'Monthly on the '+String(e.monthly_rule).trim():null}
function setStyle(value){style=value;$$('.chip').forEach(b=>{const active=b.dataset.filter===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});render()}
function render(reset=true){
 if(reset)shown=9;
 results=searchEvents(events,{place:$('#place').value,when:$('#when').value,query:$('#search').value,style,savedOnly,saved,includeUnverified:$('#include-unverified').checked});
 $('#event-list').setAttribute('aria-busy','false');$('#result-count').textContent=`${results.length} ${results.length===1?'event':'events'}${savedOnly?' saved':''} · next occurrence shown`;
 $('#load-more').hidden=results.length<=shown;
 $('#event-list').innerHTML=results.length?results.slice(0,shown).map(({event:e,date,cancel})=>`<article class="event-row${cancel?' is-canceled-row':''}"><div class="date-stamp" aria-label="${esc(formatDate(date,{dateStyle:'full'}))}"><span>${formatDate(date,{month:'short'})}</span><strong>${formatDate(date,{day:'numeric'})}</strong><span>${formatDate(date,{weekday:'short'})}</span></div><div class="event-main"><div class="event-tags"><span>${esc(e.style||'Dance')}</span><span class="recurrence">${esc(e.type==='one_time'?'One-time':scheduleLabel(e))}${e.unverified?' · Unverified':''}</span>${cancelTag(cancel)}</div><button class="event-name" data-detail="${esc(e.key)}">${esc(e.name)}</button><p class="event-venue">${esc(e.venue||'Venue not listed')}</p>${cancel&&cancel.note?`<p class="cancel-note">${esc(cancel.note)}</p>`:''}</div><div class="event-meta">${esc(rangeLabel(e))}<small>${esc(e.cost||'Price not listed')}</small></div><button class="save-event" data-save="${esc(e.key)}" aria-pressed="${saved.has(e.key)}" aria-label="${saved.has(e.key)?'Unsave':'Save'} ${esc(e.name)}">${saved.has(e.key)?'♥':'♡'}</button></article>`).join(''):`<div class="empty"><strong>${savedOnly?'No saved events match these filters.':'No dances match these filters.'}</strong><br>${savedOnly?'Save a dance with the heart button, or try a broader area.':'Try another style, a wider date range, or Everywhere.'}<br><button id="empty-reset">Show all upcoming events</button></div>`;
 $('#empty-reset')?.addEventListener('click',()=>{resetFilters();$('#place').value='all';$('#when').value='all';render()});
}
function resetFilters(){ $('#include-unverified').checked=false;$('#search').value='';$('#place').value='gulf';$('#when').value='30';savedOnly=false;$('#saved-filter').setAttribute('aria-pressed','false');setStyle('all') }
function openDetails(key){
 const item=results.find(x=>x.event.key===key);if(!item)return;const {event:e,date,cancel}=item;openedEvent=key;const source=safeURL(e.source_url);const listingURL='https://danceeventviewer.net/dance-event-viewer/?events='+encodeURIComponent(e.key)+'&unverified=1';const directions='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(e.venue||'');
 const dateText=formatDate(date,{dateStyle:'full'})+(e.type==='one_time'&&e.end_date&&e.end_date!==date?' through '+formatDate(e.end_date,{dateStyle:'full'}):'');
 $('#dialog-content').innerHTML=`<div class="event-tags">${esc(e.style||'Dance')} · ${e.unverified?'Unverified listing':'Dance Event Viewer listing'}</div><h2 id="dialog-title">${esc(e.name)}</h2><dl><dt>WHEN</dt><dd>${cancel?`<strong class="gc-cancel-tag gc-cancel-tag--${esc(cancel.status)}">${esc(cancel.label)}</strong><br>`:''}${esc(dateText)}<br>${esc(rangeLabel(e))} · venue local time${cancel&&cancel.note?`<br><span class="cancel-note">${esc(cancel.note)}</span>`:''}</dd><dt>WHERE</dt><dd>${esc(e.venue||'Venue not listed')}</dd><dt>COST</dt><dd>${esc(e.cost||'Price not listed')}</dd><dt>SCHEDULE</dt><dd>${esc(scheduleLabel(e))}</dd></dl><button id="dialog-save" class="button button-red"></button><div class="dialog-links">${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Organizer’s event page ↗</a>`:''}<a href="${esc(listingURL)}" target="_blank" rel="noopener">This listing in the full viewer ↗</a>${e.venue?`<a href="${esc(directions)}" target="_blank" rel="noopener">Venue on Google Maps ↗</a>`:''}</div><p class="dialog-note">Details come from the Dance Event Viewer feed.${e.verified_on?' Listing checked '+esc(e.verified_on)+'.':''}${e.type!=='one_time'?' This date is calculated from the listed recurring schedule.':''}${e.unverified?' This listing is marked unverified.':''} Confirm any missing details or schedule changes with the organizer.</p>`;
 updateDialogSave();$('#dialog-save').addEventListener('click',()=>toggleSaved(key));$('#event-dialog').showModal();
}
function updateDialogSave(){const b=$('#dialog-save');if(b){b.textContent=saved.has(openedEvent)?'♥ Saved to your nights':'♡ Save this dance';b.setAttribute('aria-pressed',String(saved.has(openedEvent)))}}
$('#event-list').addEventListener('click',e=>{const detail=e.target.closest('[data-detail]'),save=e.target.closest('[data-save]');if(detail)openDetails(detail.dataset.detail);if(save)toggleSaved(save.dataset.save)});
$('.dialog-close').addEventListener('click',()=>$('#event-dialog').close());$('#event-dialog').addEventListener('close',()=>{openedEvent=null});$('#event-dialog').addEventListener('click',e=>{if(e.target===$('#event-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$('#filters').addEventListener('submit',e=>{e.preventDefault();render()});let searchTimer;$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>render(),160)});$('#include-unverified').addEventListener('change',()=>render());['place','when'].forEach(id=>$('#'+id).addEventListener('change',()=>render()));
$$('.chip').forEach(b=>b.addEventListener('click',()=>setStyle(b.dataset.filter)));
$('#saved-filter').addEventListener('click',()=>{savedOnly=!savedOnly;$('#saved-filter').setAttribute('aria-pressed',String(savedOnly));render()});$('#reset').addEventListener('click',resetFilters);$('#load-more').addEventListener('click',()=>{shown+=9;render(false)});
// The edge feed did not carry cancel fields before its 2026-10-31 FIELDS update (needs a redeploy),
// and the saved snapshot never did. When they are missing, read just key + cancel fields from the
// public listings table with the site's public key (read-only GET), and merge them by key.
async function addCancelFields(list){
 if(list.some(e=>Object.hasOwn(e,'canceled_dates')||Object.hasOwn(e,'cancel_status')))return;
 const cfg=window.DANCE_EVENT_VIEWER_SUPABASE;if(!cfg?.enabled||!cfg.url||!cfg.publishableKey||!cfg.table)return;
 try{
  const q=new URLSearchParams({select:'key,canceled_dates,cancel_status',or:'(canceled_dates.not.is.null,cancel_status.not.is.null)'});
  const r=await fetch(`${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?${q}`,{cache:'no-store',headers:{apikey:cfg.publishableKey},signal:AbortSignal.timeout(8000)});
  if(!r.ok)return;const rows=await r.json();if(!Array.isArray(rows))return;
  const byKey=new Map(rows.filter(x=>x&&typeof x.key==='string').map(x=>[x.key,x]));
  for(const e of list){const x=byKey.get(e.key);if(x){e.canceled_dates=x.canceled_dates;e.cancel_status=x.cancel_status}}
 }catch{}
}
async function load(){
 let data,isSnapshot=false;
 try{const response=await fetch(FEED,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!response.ok)throw new Error('Feed unavailable');data=await response.json();if(!Array.isArray(data.events))throw new Error('Invalid feed')}
 catch{isSnapshot=true;try{const response=await fetch('./events-snapshot.json');if(!response.ok)throw new Error('Snapshot unavailable');data=await response.json()}catch{$('#feed-status').textContent='Listings unavailable';$('#feed-status').classList.add('offline');$('#event-list').setAttribute('aria-busy','false');$('#event-list').innerHTML='<div class="empty">We couldn’t load the listings.<br><a class="text-link" href="https://danceeventviewer.net/dance-event-viewer/">Open Dance Event Viewer ↗</a></div>';$('#result-count').textContent='Unable to load events';return}}
 events=data.events.filter(e=>e&&e.name&&e.key);await addCancelFields(events);const updated=data.generated_at?new Date(data.generated_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'date unavailable';
 $('#feed-status').textContent=isSnapshot?'Saved listings · '+updated:'Live listings · '+updated;$('#feed-status').classList.toggle('offline',isSnapshot);
 if(isSnapshot)$('#data-note').prepend(document.createTextNode(`Live feed unavailable. Showing a saved copy from ${updated}. `));render();
}
updateSaved();load();
// Play the hero once. Reduced motion uses the poster.
const heroVideo = $('#hero-video');
const heroLogo = $('.hero-logo-overlay');
let heroFinished = false;
heroVideo?.addEventListener('ended',()=>{heroFinished=true;heroLogo?.classList.add('is-visible')});
heroVideo?.addEventListener('timeupdate',()=>{if(heroVideo.currentTime>=4)heroLogo?.classList.add('is-visible')});
const heroMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function syncHeroMotion(){
 if(!heroVideo)return;
 heroVideo.loop=false;
 if(heroFinished){heroVideo.pause();return}
 if(heroMotion.matches){heroVideo.pause();heroVideo.currentTime=0;heroLogo?.classList.add('is-visible');return}
 heroVideo.muted=true;
 heroVideo.play().catch(()=>{});
}
heroMotion.addEventListener('change',syncHeroMotion);
syncHeroMotion();
// Keep the reading progress indicator with the hero.
window.addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;$('#scroll-progress').style.transform=`scaleX(${max>0?window.scrollY/max:0})`},{passive:true});
