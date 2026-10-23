// card: how the badge is drawn on the beige event card. 'ink' = one-colour light logo, shown in the
// page's dark ink (CSS filter, shape untouched); 'color' = multi-colour logo kept in colour (USA Dance
// uses a card copy with its cream figures recoloured to ink); 'photo' = instructor photo, unchanged.
// Explicit identity rules only. A venue match means "at this studio", not ownership.
export const BADGES = Object.freeze([
  {id:'psds',name:'Pensacola Swing Dance Society',kind:'Group',card:'ink'},
  {id:'twym',name:'The Way You Move',kind:'Studio / venue',card:'ink'},
  {id:'seaside',name:'Seaside Swing-Outs',kind:'Group',card:'ink'},
  {id:'mobile-wcs',name:'Mobile WCS',kind:'Community',card:'ink'},
  {id:'usa-dance',name:'USA Dance',kind:'National organization',card:'color'},
  {id:'coastals',name:'Pensacola Coastals',kind:'Studio',card:'ink'},
  {id:'starlite',name:'Starlite Ballroom',kind:'Studio · Mobile',card:'ink'},
  {id:'todd-jamie',name:'Let’s Dance Pensacola (Todd and Jamie)',kind:'Group',card:'photo'},
  {id:'nina-travis',name:'Nina & Travis',kind:'Instructors',card:'photo'},
  {id:'rachel-zander',name:'Rachel & Zander',kind:'Instructors',card:'photo'},
  {id:'traci-bell',name:'Traci Bell',kind:'Instructor',card:'photo'},
  {id:'john-alicia',name:'John & Alicia',kind:'Instructors',card:'photo'},
  {id:'gary-jobst',name:'Gary Jobst',kind:'Instructor',card:'photo'}
]);
const norm=s=>String(s||'').toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim();
export function badgeIds(ev={}) {
  const key=norm(ev.key),name=norm(ev.name),venue=norm(ev.venue),source=norm(ev.source_url);
  const people=norm(Array.isArray(ev.instructors)?ev.instructors.join(' '):ev.instructors);
  const text=name+' '+people, ids=[];
  if(key.startsWith('psds-')||['bobe-st-studio-coaching-with-justin-tuesdays','monday-night-west-coast-swing-dance-party-ragon-hall','ragon-hall-first-saturday-monthly-dance','3rd-saturday-west-coast-swing-old-sacred-heart-2026-07-18'].includes(key)||name.includes('pensacola swing dance society')||source.includes('pensacolaswingdancesociety.com')||/\btaylor morton\b/.test(text))ids.push('psds');
  if(venue.includes('the way you move')||name.includes('the way you move')||key.startsWith('west-coast-wednesdays-in-'))ids.push('twym');
  if(name.includes('seaside swing-outs')||key.startsWith('seaside-swing-outs-')||key.startsWith('sso-lindy-and-blues-')||key==='first-friday-live-band-dance-night-seaside-swing-outs')ids.push('seaside');
  if(key.startsWith('mobtown-')||name.includes('mobile west coast swing'))ids.push('mobile-wcs');
  if(key.startsWith('usa-dance-')||source.includes('usadance.org')||name.includes('usa dance'))ids.push('usa-dance');
  if(key.startsWith('pensacola-coastals-')||venue.includes('pensacola coastals')||source.includes('pensacolacoastals.wixsite.com'))ids.push('coastals');
  if(key==='starlite-ballroom-tuesday-ballroom-latin-class'||key==='ttdgc-starlight-ballroom-friday'||source.includes('starliteballroomal.com')||(/starlite ballroom/.test(venue)&&/mobile/.test(venue)))ids.push('starlite');
  if(key==='sanders-beach-ballroom-weekly-classes'||key.startsWith('good-ole-social-dance')||/\btodd and jamie\b/.test(text))ids.push('todd-jamie');
  if(key==='ttdgc-dancing-nina-travis-andy-tuesday'||(/\bnina outlaw\b/.test(text)&&/\btravis outlaw\b/.test(text)&&/\bandy\b/.test(text)))ids.push('nina-travis');
  if(/\brachel\s*(?:&|and)\s*zander\b/.test(text))ids.push('rachel-zander');
  if(/\btraci bell\b/.test(text))ids.push('traci-bell');
  if(/\bgary jobst\b/.test(text))ids.push('gary-jobst');
  // John & Alicia: approved shared identity; event associations await verified evidence.
  return ids.sort((a,b)=>(a==='twym')-(b==='twym'));
}
export const matchesBadge=(ev,ids)=>{const chosen=Array.isArray(ids)?ids:ids?[ids]:[];return !chosen.length||badgeIds(ev).some(id=>chosen.includes(id));};
const vectors=new Set(['coastals','starlite','bill-thrall']);
export const badgeAssetFile=(id,size)=>(size===30&&id==='usa-dance')?'usa-dance-card.png':['rachel-zander','traci-bell','john-alicia','nina-travis','gary-jobst','todd-jamie'].includes(id)?id+'-teacher-avatar.png':vectors.has(id)?id+((size===30&&['starlite'].includes(id))?'-card':'')+'.svg':id+'-240.png';
const asset=(id,size)=>new URL('assets/organizer-badges/'+badgeAssetFile(id,size)+'?v='+(id==='john-alicia'?'ja-v3':id==='nina-travis'?'db587e27':id==='gary-jobst'?'d9bc17e5':id==='todd-jamie'?'e20746a6':'sharp-4'),import.meta.url).href;
export function addCardBadge(host,ev) {
  const id=badgeIds(ev)[0];if(!id)return;
  const item=BADGES.find(b=>b.id===id),img=document.createElement('img');
  img.className='organizer-card-badge'+(item.card==='photo'?' organizer-card-badge-color':item.card==='ink'?' organizer-card-badge-ink':'');img.width=30;img.height=30;img.src=asset(id,30);img.alt=item.name;img.title=item.name;img.decoding='async';
  img.addEventListener('error',()=>img.remove(),{once:true});host.classList.add('has-organizer-badge');
  // Float the logo inside the style label so the label wraps beside/below it and never runs under it.
  const label=host.querySelector('.tile-style');if(!label){host.appendChild(img);return;}
  // Keep each style phrase ("West Coast Swing") together: one inline-block per " / " part, so a phrase
  // either fits beside the logo or drops below it whole. textContent stays identical.
  if(!label.children.length){const parts=label.textContent.split(/\s*\/\s*/).filter(Boolean);label.textContent='';
    parts.forEach((t,i)=>{const s=document.createElement('span');s.className='tile-style-part';s.textContent=t+(i<parts.length-1?' /':'');label.append(s);if(i<parts.length-1)label.append(' ');});}
  label.prepend(img);
}
export function createBadgePicker(after,onChange) {
  const selected=new Set();const section=document.createElement('section');section.className='organizer-picker';section.hidden=true;
  const heading=document.createElement('h3');heading.className='badge-sr-only';heading.textContent='Groups, studios & instructors';section.appendChild(heading);
  const help=document.createElement('p');help.className='badge-sr-only';help.textContent='Choose any groups to narrow these events. Studio badges also include events hosted there.';section.appendChild(help);
  const buttons=document.createElement('div');buttons.className='organizer-choices';buttons.setAttribute('role','group');buttons.setAttribute('aria-label','Filter by group, studio or instructor');section.appendChild(buttons);
  for(const item of BADGES){const b=document.createElement('button');b.type='button';b.className='organizer-choice';b.dataset.organizer=item.id;b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',item.name);const img=document.createElement('img');img.src=asset(item.id,40);img.width=40;img.height=40;img.alt='';img.addEventListener('error',()=>img.remove(),{once:true});b.title=item.name;b.append(img);b.addEventListener('click',()=>{selected.has(item.id)?selected.delete(item.id):selected.add(item.id);refresh();onChange();});buttons.appendChild(b);}
  const clear=document.createElement('button');clear.type='button';clear.className='organizer-clear';clear.textContent='×';clear.setAttribute('aria-label','Clear group filter');clear.title='Clear group filter';clear.hidden=true;clear.addEventListener('click',()=>{selected.clear();refresh();onChange();});section.appendChild(clear);
  const status=document.createElement('p');status.className='organizer-status badge-sr-only';status.setAttribute('role','status');section.appendChild(status);const layout=document.createElement('div');layout.className='style-organizer-layout';after.before(layout);layout.append(after,section);
  function refresh(){buttons.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(selected.has(b.dataset.organizer))));clear.hidden=!selected.size;status.textContent=selected.size?'Showing '+BADGES.filter(b=>selected.has(b.id)).map(b=>b.name).join(', ')+'. Other place, style and date filters still apply.':'';}
  return {get selected(){return [...selected];},update(items){for(const id of selected)if(!BADGES.some(b=>b.id===id))selected.delete(id);section.hidden=false;for(const b of buttons.children){const keys=new Set(items.filter(x=>matchesBadge(x.ev,b.dataset.organizer)).map(x=>x.ev.key));b.setAttribute('aria-label',BADGES.find(x=>x.id===b.dataset.organizer).name+', '+keys.size+' listed');b.title=BADGES.find(x=>x.id===b.dataset.organizer).name+' — '+keys.size+' listed';}refresh();}};
}
