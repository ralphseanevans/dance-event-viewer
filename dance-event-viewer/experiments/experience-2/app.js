import heroClip from "./assets/hero-title-clip.js";
import heroRepeatClip from "./assets/hero-repeat-clip.js";
import {FEED,todayKey,parseDate,searchEvents,timeLabel,escapeHTML as esc,safeURL} from './events.mjs?v=4ae3925d';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let events=[],results=[],shown=9,style='all',savedOnly=false,selectedStyle='West Coast Swing',openedEvent=null;
let saved;try{const value=JSON.parse(localStorage.getItem('dev-experience-saved')||'[]');saved=new Set(Array.isArray(value)?value:[])}catch{saved=new Set()}
const formatDate=(key,opts)=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...opts}).format(parseDate(key));
function updateSaved(){ $('#saved-count').textContent=saved.size;try{localStorage.setItem('dev-experience-saved',JSON.stringify([...saved]))}catch{} }
function toggleSaved(key){saved.has(key)?saved.delete(key):saved.add(key);updateSaved();render(false);if(openedEvent===key)updateDialogSave()}
function rangeLabel(e){if(!e.start_time)return'Time not listed';return timeLabel(e.start_time)+(e.end_time?' – '+timeLabel(e.end_time):'')}
function scheduleLabel(e){return e.type==='weekly_recurring'?'Every '+e.day_of_week:e.type==='monthly_recurring'?e.monthly_rule:'One-time event'}
function setStyle(value){style=value;$$('.chip').forEach(b=>{const active=b.dataset.filter===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});render()}
function render(reset=true){
 if(reset)shown=9;
 results=searchEvents(events,{place:$('#place').value,when:$('#when').value,query:$('#search').value,style,savedOnly,saved,includeUnverified:$('#include-unverified').checked});
 $('#event-list').setAttribute('aria-busy','false');$('#result-count').textContent=`${results.length} ${results.length===1?'event':'events'}${savedOnly?' saved':''} · next occurrence shown`;
 $('#load-more').hidden=results.length<=shown;
 $('#event-list').innerHTML=results.length?results.slice(0,shown).map(({event:e,date})=>`<article class="event-row"><div class="date-stamp" aria-label="${esc(formatDate(date,{dateStyle:'full'}))}"><span>${formatDate(date,{month:'short'})}</span><strong>${formatDate(date,{day:'numeric'})}</strong><span>${formatDate(date,{weekday:'short'})}</span></div><div class="event-main"><div class="event-tags"><span>${esc(e.style||'Dance')}</span><span class="recurrence">${esc(e.type==='one_time'?'One-time':scheduleLabel(e))}${e.unverified?' · Unverified':''}</span></div><button class="event-name" data-detail="${esc(e.key)}">${esc(e.name)}</button><p class="event-venue">${esc(e.venue||'Venue not listed')}</p></div><div class="event-meta">${esc(rangeLabel(e))}<small>${esc(e.cost||'Price not listed')}</small></div><button class="save-event" data-save="${esc(e.key)}" aria-pressed="${saved.has(e.key)}" aria-label="${saved.has(e.key)?'Unsave':'Save'} ${esc(e.name)}">${saved.has(e.key)?'♥':'♡'}</button></article>`).join(''):`<div class="empty"><strong>${savedOnly?'No saved events match these filters.':'No dances match these filters.'}</strong><br>${savedOnly?'Save a dance with the heart button, or try a broader area.':'Try another style, a wider date range, or Everywhere.'}<br><button id="empty-reset">Show all upcoming events</button></div>`;
 $('#empty-reset')?.addEventListener('click',()=>{resetFilters();$('#place').value='all';$('#when').value='all';render()});
}
function resetFilters(){ $('#include-unverified').checked=false;$('#search').value='';$('#place').value='gulf';$('#when').value='30';savedOnly=false;$('#saved-filter').setAttribute('aria-pressed','false');setStyle('all') }
function openDetails(key){
 const item=results.find(x=>x.event.key===key);if(!item)return;const {event:e,date}=item;openedEvent=key;const source=safeURL(e.source_url);const listingURL='https://danceeventviewer.net/dance-event-viewer/?events='+encodeURIComponent(e.key)+'&unverified=1';const directions='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(e.venue||'');
 const dateText=formatDate(date,{dateStyle:'full'})+(e.type==='one_time'&&e.end_date&&e.end_date!==date?' through '+formatDate(e.end_date,{dateStyle:'full'}):'');
 $('#dialog-content').innerHTML=`<div class="event-tags">${esc(e.style||'Dance')} · ${e.unverified?'Unverified listing':'Dance Event Viewer listing'}</div><h2 id="dialog-title">${esc(e.name)}</h2><dl><dt>WHEN</dt><dd>${esc(dateText)}<br>${esc(rangeLabel(e))} · venue local time</dd><dt>WHERE</dt><dd>${esc(e.venue||'Venue not listed')}</dd><dt>COST</dt><dd>${esc(e.cost||'Price not listed')}</dd><dt>SCHEDULE</dt><dd>${esc(scheduleLabel(e))}</dd></dl><button id="dialog-save" class="button button-red"></button><div class="dialog-links">${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Organizer’s event page ↗</a>`:''}<a href="${esc(listingURL)}" target="_blank" rel="noopener">This listing in the full viewer ↗</a>${e.venue?`<a href="${esc(directions)}" target="_blank" rel="noopener">Venue on Google Maps ↗</a>`:''}</div><p class="dialog-note">Details come from the Dance Event Viewer feed.${e.verified_on?' Listing checked '+esc(e.verified_on)+'.':''}${e.type!=='one_time'?' This date is calculated from the listed recurring schedule.':''}${e.unverified?' This listing is marked unverified.':''} Confirm any missing details or schedule changes with the organizer.</p>`;
 updateDialogSave();$('#dialog-save').addEventListener('click',()=>toggleSaved(key));$('#event-dialog').showModal();
}
function updateDialogSave(){const b=$('#dialog-save');if(b){b.textContent=saved.has(openedEvent)?'♥ Saved to your nights':'♡ Save this dance';b.setAttribute('aria-pressed',String(saved.has(openedEvent)))}}
$('#event-list').addEventListener('click',e=>{const detail=e.target.closest('[data-detail]'),save=e.target.closest('[data-save]');if(detail)openDetails(detail.dataset.detail);if(save)toggleSaved(save.dataset.save)});
$('.dialog-close').addEventListener('click',()=>$('#event-dialog').close());$('#event-dialog').addEventListener('close',()=>{openedEvent=null});$('#event-dialog').addEventListener('click',e=>{if(e.target===$('#event-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$('#filters').addEventListener('submit',e=>{e.preventDefault();render()});let searchTimer;$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>render(),160)});$('#include-unverified').addEventListener('change',()=>render());['place','when'].forEach(id=>$('#'+id).addEventListener('change',()=>render()));
$$('.chip').forEach(b=>b.addEventListener('click',()=>setStyle(b.dataset.filter)));
$('#saved-filter').addEventListener('click',()=>{savedOnly=!savedOnly;$('#saved-filter').setAttribute('aria-pressed',String(savedOnly));render()});$('#reset').addEventListener('click',resetFilters);$('#load-more').addEventListener('click',()=>{shown+=9;render(false)});
$$('.style-choice').forEach(b=>b.addEventListener('click',()=>{selectedStyle=b.dataset.style;$$('.style-choice').forEach(c=>{const active=c===b;c.classList.toggle('active',active);c.setAttribute('aria-pressed',String(active))});const title=b.children[1].childNodes[0].textContent;$('#style-cta').innerHTML=`Explore ${esc(title)} <span aria-hidden="true">↗</span>`;$('.style-orbit').style.filter=selectedStyle==='Latin'?'hue-rotate(-15deg)':selectedStyle==='Tango'?'hue-rotate(20deg)':'none'}));$('#style-cta').addEventListener('click',()=>setStyle(selectedStyle));
function renderLocalInformation(snapshot,updated){
 const common={when:'30',includeUnverified:false};
 $('#southern-count').textContent=searchEvents(events,{...common,place:'south'}).length;
 $('#coast-count').textContent=searchEvents(events,{...common,place:'gulf'}).length;
 $('#wcs-count').textContent=searchEvents(events,{...common,place:'south',style:'West Coast Swing'}).length;
 if(snapshot)$('.hero-facts small').textContent=`Saved feed: ${updated} · next 30 days · unverified excluded`;
 const cities=[{key:'pensacola',name:'Pensacola',description:'Pensacola, Gulf Breeze, Pace & Milton'},{key:'mobile',name:'Mobile',description:'Mobile, the Eastern Shore & Dauphin Island'},{key:'emerald',name:'Emerald Coast',description:'Destin, Fort Walton Beach & nearby'}];
 $('#city-previews').innerHTML=cities.map((city,i)=>{
  const rows=searchEvents(events,{...common,place:city.key});const example=rows.find(r=>(r.event.style||'').includes('West Coast Swing'))||rows[0];
  return `<article class="city-preview"><div class="city-top"><span>0${i+1}</span><strong>${rows.length}<small>upcoming listings</small></strong></div><h3>${city.name}</h3><p>${city.description}</p><div class="city-example">${example?`<span>FROM THE CALENDAR · ${esc(formatDate(example.date,{month:'short',day:'numeric'}))}</span><strong>${esc(example.event.name)}</strong><small>${esc(rangeLabel(example.event))}</small>`:'<span>No upcoming listings in this area.</span>'}</div><button data-city="${city.key}">Explore ${city.name} <span aria-hidden="true">↗</span></button></article>`;
 }).join('');
}
$('#city-previews').addEventListener('click',e=>{const b=e.target.closest('[data-city]');if(!b)return;resetFilters();$('#place').value=b.dataset.city;render();$('#events').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});
async function load(){
 let data,isSnapshot=false;
 try{const response=await fetch(FEED,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!response.ok)throw new Error('Feed unavailable');data=await response.json();if(!Array.isArray(data.events))throw new Error('Invalid feed')}
 catch{isSnapshot=true;try{const response=await fetch('./events-snapshot.json');if(!response.ok)throw new Error('Snapshot unavailable');data=await response.json()}catch{$('#feed-status').textContent='Listings unavailable';$('#feed-status').classList.add('offline');$('#event-list').setAttribute('aria-busy','false');$('#event-list').innerHTML='<div class="empty">We couldn’t load the listings.<br><a class="text-link" href="https://danceeventviewer.net/dance-event-viewer/">Open Dance Event Viewer ↗</a></div>';$('#result-count').textContent='Unable to load events';$('#city-previews').innerHTML='<p class="empty">Local previews are unavailable. Use the full viewer for listings.</p>';return}}
 events=data.events.filter(e=>e&&e.name&&e.key);const updated=data.generated_at?new Date(data.generated_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'date unavailable';
 $('#feed-status').textContent=isSnapshot?'Saved listings · '+updated:'Live listings · '+updated;$('#feed-status').classList.toggle('offline',isSnapshot);
 renderLocalInformation(isSnapshot,updated);if(isSnapshot)$('#data-note').prepend(document.createTextNode(`Live feed unavailable. Showing a saved copy from ${updated}. `));render();
}
updateSaved();load();
// Lightweight visual effects: 2D canvas and CSS, with no GPU compatibility gate.
let motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero=$('.hero'),art=$('.hero-art'),heroVideo=$('#hero-video'),canvas=$('#atmosphere'),ctx=canvas.getContext('2d');let width=0,height=0,pointer={x:0,y:0},scrollY=0,frame=0,last=0;
heroVideo.src=heroClip;
heroVideo.loop=false;
heroVideo.addEventListener("ended",()=>{
 heroVideo.src=heroRepeatClip;
 heroVideo.loop=true;
 heroVideo.load();
 syncHeroVideo();
},{once:true});
const dust=Array.from({length:38},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.1+.2,v:Math.random()*.00005+.000015}));
function resize(){width=hero.clientWidth;height=hero.clientHeight;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=width*ratio;canvas.height=height*ratio;ctx?.setTransform(ratio,0,0,ratio,0,0)}
function draw(t){frame=0;if(!motion||document.hidden||scrollY>height)return;if(t-last<32){frame=requestAnimationFrame(draw);return}last=t;if(ctx){ctx.clearRect(0,0,width,height);ctx.fillStyle='#eee8da';dust.forEach(p=>{p.y-=p.v*32;if(p.y<0)p.y=1;ctx.globalAlpha=.18+p.r*.16;ctx.beginPath();ctx.arc(p.x*width+pointer.x*6,p.y*height,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1}art.style.setProperty('--mx',`${pointer.x*9}px`);art.style.setProperty('--my',`${pointer.y*7+Math.min(scrollY*.13,85)}px`);frame=requestAnimationFrame(draw)}
function startMotion(){if(motion&&!frame&&!document.hidden&&scrollY<=height)frame=requestAnimationFrame(draw)}
function syncHeroVideo(){if(motion&&!document.hidden&&scrollY<=height){if(heroVideo.paused&&!heroVideo.ended)heroVideo.play().catch(()=>{})}else heroVideo.pause()}
function setMotion(value){motion=value;document.body.classList.toggle('no-motion',!motion);document.body.classList.toggle('js-motion',motion);if(!motion){cancelAnimationFrame(frame);frame=0;ctx?.clearRect(0,0,width,height)}else startMotion();syncHeroVideo()}
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.08});$$('.reveal').forEach(el=>observer.observe(el));
hero.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const rect=hero.getBoundingClientRect();pointer={x:(e.clientX-rect.left)/width-.5,y:(e.clientY-rect.top)/height-.5}});hero.addEventListener('pointerleave',()=>{pointer={x:0,y:0}});window.addEventListener('scroll',()=>{scrollY=window.scrollY;const max=document.documentElement.scrollHeight-innerHeight;$('#scroll-progress').style.transform=`scaleX(${max>0?scrollY/max:0})`;startMotion();syncHeroVideo()},{passive:true});window.addEventListener('resize',resize);resize();setMotion(motion);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else startMotion();syncHeroVideo()});
