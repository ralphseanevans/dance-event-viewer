export const FEED='https://xyyxbwetagfexsqtokpk.supabase.co/functions/v1/dance-events/dance_events_live.json';
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const dateKey=d=>d.toISOString().slice(0,10);
export const parseDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?new Date(s+'T12:00:00Z'):null;
export const addDays=(s,n)=>{const d=parseDate(s);d.setUTCDate(d.getUTCDate()+n);return dateKey(d)};
export function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function monthlyMatches(rule,key){
 if(!rule)return false;const d=parseDate(key),day=weekdays[d.getUTCDay()];
 const text=String(rule).toLowerCase();if(!text.includes(day.toLowerCase()))return false;
 const n=Math.ceil(d.getUTCDate()/7),names=['','first','second','third','fourth','fifth'];
 return text.includes(names[n])||(text.includes('last')&&parseDate(addDays(key,7)).getUTCMonth()!==d.getUTCMonth());
}
export function occursOn(e,key){
 if(e.start_date&&key<e.start_date)return false;
 if(e.end_date&&key>e.end_date)return false;
 if(Array.isArray(e.exclude_dates)&&e.exclude_dates.includes(key))return false;
 if(Array.isArray(e.exclude_monthly_rules)&&e.exclude_monthly_rules.some(r=>monthlyMatches(r,key)))return false;
 if(e.type==='one_time')return Boolean(e.start_date&&key>=e.start_date&&key<=(e.end_date||e.start_date));
 if(e.type==='weekly_recurring')return weekdays[parseDate(key).getUTCDay()].toLowerCase()===String(e.day_of_week||'').toLowerCase();
 if(e.type==='monthly_recurring')return monthlyMatches(e.monthly_rule,key);
 return false;
}
export function dateRange(mode,today=todayKey()){
 if(mode==='today')return[today,today];
 if(mode==='weekend'){
 const dow=parseDate(today).getUTCDay();const start=dow===0||dow===6?today:addDays(today,(5-dow+7)%7);
 const end=addDays(today,(7-dow)%7);return[start,end];
 }
 return[today,addDays(today,mode==='all'?730:Number(mode)-1)];
}
export function nextOccurrence(e,start,end){
 if(e.type==='one_time'){
 if(!parseDate(e.start_date))return null;
 const candidate=e.start_date>start?e.start_date:start;
 return candidate<=end&&occursOn(e,candidate)?candidate:null;
 }
 let candidate=e.start_date&&e.start_date>start?e.start_date:start;
 if(!parseDate(candidate))return null;
 // Search beyond one month so exclusions and fifth-weekday rules remain correct.
 const limit=addDays(candidate,370);const finish=end<limit?end:limit;
 while(candidate<=finish){if(occursOn(e,candidate))return candidate;candidate=addDays(candidate,1)}
 return null;
}
export function styleMatches(e,style){
 const s=(e.style||'').toLowerCase();if(style==='all')return true;
 if(style==='Latin')return /salsa|bachata|latin/.test(s);
 if(style==='Country')return /country|line/.test(s);
 return s.includes(style.toLowerCase());
}
export function placeMatches(e,place){
 if(place==='all')return true;
 if(place==='south')return ['FL','GA','AL','MS','LA','TN','SC','NC'].includes(e.state);
 if(place==='pensacola')return /pensacola|gulf breeze|pace,|milton,/i.test(e.venue||'');
 if(place==='mobile')return /mobile|daphne|fairhope|spanish fort|dauphin island/i.test(e.venue||'');
 if(place==='emerald')return /destin|fort walton|niceville|mary esther/i.test(e.venue||'');
 if(place==='gulf')return /pensacola|mobile|destin|fort walton|niceville|mary esther|gulf breeze|gulf shores|orange beach|daphne|fairhope|spanish fort|navarre|dauphin island|milton|pace,|foley|panama city|biloxi|gulfport|ocean springs/i.test(e.venue||'');
 return e.state===place;
}
export function searchEvents(events,{place='gulf',style='all',when='30',query='',savedOnly=false,saved=new Set(),includeUnverified=false,today=todayKey()}={}){
 const [start,end]=dateRange(when,today);const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return events.filter(e=>e&&e.key&&(includeUnverified||!e.unverified)&&placeMatches(e,place)&&styleMatches(e,style)&&(!savedOnly||saved.has(e.key))&&terms.every(t=>[e.name,e.venue,e.style,e.state].join(' ').toLowerCase().includes(t))).map(event=>({event,date:nextOccurrence(event,start,end)})).filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date)||(a.event.start_time||'99').localeCompare(b.event.start_time||'99')||a.event.name.localeCompare(b.event.name));
}
export function timeLabel(value){if(!/^\d{1,2}:\d{2}/.test(value||''))return'Time not listed';const [h,m]=value.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`}
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
