import test from 'node:test';import assert from 'node:assert/strict';
import {BADGES,badgeIds,matchesBadge,badgeAssetFile} from '../../gulfcoast/organizer-badges.mjs';
test('trial has twelve distinct identities, eight groups/studios and no withheld Taylor',()=>{assert.equal(BADGES.length,12);assert.equal(new Set(BADGES.map(x=>x.id)).size,12);assert.equal(BADGES.filter(x=>!x.kind.includes('Instructor')).length,8);assert(!BADGES.some(x=>/oblow/i.test(x.name)));});
test('Taylor Morton uses PSDS; Taylor Oblow and personal relationships do not',()=>{assert.deepEqual(badgeIds({name:'Workshop',instructors:['Taylor Morton']}),['psds']);assert.deepEqual(badgeIds({name:'Workshop',instructors:['Taylor Oblow','Jake']}),[]);});
test('unrelated first/third Saturday events and unknown instructors stay unassigned',()=>{assert.deepEqual(badgeIds({key:'ga-marietta-tango-social-3rd-saturday-milonga-2026-08-15',name:'Third Saturday Milonga'}),[]);assert.deepEqual(badgeIds({name:'West Coast Swing',venue:'Ragon Hall'}),[]);assert.deepEqual(badgeIds({name:'Workshop',instructors:['John Doe']}),[]);});
test('source-backed Seaside event at TWYM matches both, with organizer card first',()=>{const ev={key:'sso-lindy-and-blues-fridays-the-way-you-move',name:'SSO Lindy & Blues',venue:'The Way You Move, Pensacola'};assert.deepEqual(badgeIds(ev),['seaside','twym']);assert(matchesBadge(ev,'seaside'));assert(matchesBadge(ev,'twym'));assert(!matchesBadge(ev,'psds'));});
test('named instruction is associated exactly, not by venue or partial first name',()=>{assert.deepEqual(badgeIds({name:'Lead/Follow Group Lesson with Bill Thrall'}),[]);assert.deepEqual(badgeIds({name:'Salsa',instructors:['John Plott']}),[]);assert.deepEqual(badgeIds({name:'Class with Bill',venue:'Evermans'}),[]);});
test('Mobile Starlite does not claim a similarly named studio elsewhere',()=>{assert.deepEqual(badgeIds({venue:'Starlite Ballroom, Mobile, AL'}),['starlite']);assert.deepEqual(badgeIds({venue:'Starlite Ballroom, San Jose, CA'}),[]);});
test('Todd/Jamie known series and reset preserve explicit scope',()=>{assert.deepEqual(badgeIds({key:'good-ole-social-dance-2026-09-11'}),['todd-jamie']);assert(matchesBadge({name:'Unassigned dance'},null));assert(!matchesBadge({name:'Unassigned dance'},'todd-jamie'));});

test('Nina/Travis shared badge uses shared-series evidence and not Nina-only appearances',()=>{assert(BADGES.some(x=>x.id==='nina-travis'));assert(!BADGES.some(x=>x.id==='john-plott'));assert.deepEqual(badgeIds({key:'ttdgc-dancing-nina-travis-andy-tuesday',name:'Dancing with Nina, Travis and Andy'}),['nina-travis']);assert.deepEqual(badgeIds({name:'Workshop',instructors:['Nina Outlaw','Travis Outlaw','Andy']}),['nina-travis']);assert(!badgeIds({name:'West Coast Swing Class & Social with Nina Outlaw'}).includes('nina-travis'));assert(!badgeIds({name:'Unknown Nina and Travis'}).includes('nina-travis'));});

test('selector assets are vector or density-safe originals, never 30px exports',()=>{for(const id of ['psds','twym','seaside','mobile-wcs','usa-dance'])assert.equal(badgeAssetFile(id,40),id+'-240.png');for(const id of ['coastals','starlite','todd-jamie','bill-thrall'])assert.equal(badgeAssetFile(id,40),id+'.svg');assert.equal(badgeAssetFile('nina-travis',40),'nina-travis-teacher-avatar.png');assert.equal(badgeAssetFile('nina-travis',30),'nina-travis-teacher-avatar.png');assert.equal(badgeAssetFile('coastals',30),'coastals.svg');});

test('shared badge is labeled Nina & Travis but still only matches the shared Nina/Travis/Andy series',()=>{assert.equal(BADGES.find(x=>x.id==='nina-travis').name,'Nina & Travis');assert(!badgeIds({name:'Class',instructors:['Nina Outlaw','Travis Outlaw']}).includes('nina-travis'));});

test("Rachel and Zander avatar uses explicit shared name only",()=>{assert(badgeIds({instructors:["Rachel & Zander"]}).includes("rachel-zander"));assert(!badgeIds({instructors:["Rachel Bowlby","Alexander Stavola"]}).includes("rachel-zander"));assert.equal(badgeAssetFile("rachel-zander",40),"rachel-zander-teacher-avatar.png");});

test("Traci avatar matches exact full name and does not claim every historic series recurrence",()=>{assert(badgeIds({instructors:["Traci Bell"]}).includes("traci-bell"));assert(!badgeIds({instructors:["Tracy Bell"]}).includes("traci-bell"));assert(!badgeIds({key:"ragon-hall-first-saturday-monthly-dance",notes:"Traci Bell taught July4"}).includes("traci-bell"));assert.equal(badgeAssetFile("traci-bell",40),"traci-bell-teacher-avatar.png");});

test("Bill badge removal preserves event content while leaving him unbadged",()=>{const ev={key:"ttdgc-bill-thrall-evermans-thursday",name:"Lesson with Bill Thrall",instructors:["Bill Thrall"]};const original=JSON.stringify(ev);assert(!BADGES.some(b=>b.id==="bill-thrall"));assert(!badgeIds(ev).includes("bill-thrall"));assert.equal(JSON.stringify(ev),original);});

test("John and Alicia approved avatar remains unmapped without verified event identity",()=>{assert.equal(BADGES.find(b=>b.id==="john-alicia").name,"John & Alicia");assert.equal(badgeAssetFile("john-alicia",40),"john-alicia-teacher-avatar.png");assert(!badgeIds({name:"John & Alicia social",instructors:["John Plott","Alicia"]}).includes("john-alicia"));});
test('Nina & Travis photo badge matches the instructor avatar format and its cache-buster tracks the file',async()=>{const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');const png=readFileSync(new URL('../../gulfcoast/assets/organizer-badges/nina-travis-teacher-avatar.png',import.meta.url));assert.equal(png.readUInt32BE(16),336);assert.equal(png.readUInt32BE(20),336);assert.equal(png[25],6);assert(png.length<250*1024);const sha=createHash('sha1').update(png).digest('hex').slice(0,8);const src=readFileSync(new URL('../../gulfcoast/organizer-badges.mjs',import.meta.url),'utf8');assert(src.includes("id==='nina-travis'?'"+sha+"'"));});

import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const gc=f=>new URL('../../gulfcoast/'+f,import.meta.url);
const css=readFileSync(gc('organizer-badges.css'),'utf8');
test('every badge declares how it is drawn on the beige card; light one-colour logos are inked, USA Dance stays colour, instructors stay photos',()=>{
  const by=Object.fromEntries(BADGES.map(b=>[b.id,b.card]));
  for(const id of ['psds','twym','seaside','mobile-wcs','coastals','starlite','todd-jamie'])assert.equal(by[id],'ink',id);
  assert.equal(by['usa-dance'],'color');
  for(const id of ['nina-travis','rachel-zander','traci-bell','john-alicia'])assert.equal(by[id],'photo',id);
  assert(BADGES.every(b=>['ink','color','photo'].includes(b.card)));
});
test('USA Dance card copy has inked figures; the picker keeps the original artwork',()=>{
  assert.equal(badgeAssetFile('usa-dance',30),'usa-dance-card.png');assert.equal(badgeAssetFile('usa-dance',40),'usa-dance-240.png');
  assert(readFileSync(gc('assets/organizer-badges/usa-dance-card.png')).length>1000);
});
test('ink logos use a shape-preserving dark filter in every view; photo badges get no filter',()=>{
  assert.match(css,/\.organizer-card-badge\.organizer-card-badge-ink\{filter:brightness\(0\) invert\(\.094\)\}/);
  assert(!/organizer-card-badge-color[^{]*\{[^}]*filter/.test(css));
  assert(!/data-zoom="0"\]\) \.organizer-card-badge:not\(\.organizer-card-badge-color\)\{filter/.test(css),'old compact-only darkening removed');
});
test('logo size follows the card body width: cqi clamp behind @supports, 42px floor on Full and on compact cards >= a 4-across phone card, 24px only below that, 64px cap on compact; Full grows with the card up to 130px',()=>{
  const sup=css.match(/@supports\(width:1cqi\)\{([\s\S]*?)\n\}/);assert(sup,'cqi sizes wrapped in @supports');
  assert.match(sup[1],/\.tile-body\.has-organizer-badge\{--logo:clamp\(42px,min\(61cqi,max\(64px,calc\(42px \+ 8cqi \+ var\(--logo-step,0px\)\)\)\),130px\)\}/);
  // Above 560px the card padding/border step up (~24px less body, ~30px when the flyer is open); --logo-step keeps the logo from shrinking there.
  assert.match(sup[1],/@media\(min-width:561px\)\{\.tile-body\.has-organizer-badge\{--logo-step:2\.4px\}\}/);
  {const f=(w,st=0)=>Math.min(130,Math.max(42,Math.min(.61*w,Math.max(64,42+.08*w+st))));for(const w of [300,400,480,520])for(const d of [20,24,30])assert(f(w-d,2.4)>=f(w),`step w=${w} d=${d}`);}
  // Full: never below #70's clamp(42px,61cqi,64px) at any width, then 42px + 8% of the body width, max 130px.
  const full=w=>Math.min(130,Math.max(42,Math.min(.61*w,Math.max(64,42+.08*w)))),old=w=>Math.min(64,Math.max(42,.61*w));
  for(const w of [60,100,165,290,500,730,950])assert(full(w)>=old(w),'w='+w);assert.equal(full(165),64);assert(Math.abs(full(730)-100.4)<.1);assert(full(950)>110&&full(950)<=130);assert.equal(full(2000),130);
  assert.match(sup[1],/#simple-groups:not\(\[data-zoom="0"\]\) \.tile-body\.has-organizer-badge\{--logo:clamp\(var\(--logo-min\),61cqi,calc\(64px \/ var\(--z,\.78\)\)\)\}/);
  // On-screen floor: 42px unless the card (194px x --z) is narrower than ~72px (z < .37), then 24px.
  assert.match(css,/#simple-groups:not\(\[data-zoom="0"\]\) \.tile-body\.has-organizer-badge\{--logo-min:calc\(clamp\(24px,calc\(\(var\(--z,\.78\) - \.37\) \* 10000px \+ 24px\),42px\) \/ var\(--z,\.78\)\)\}/);
  const floor=z=>Math.min(42,Math.max(24,(z-.37)*10000+24));
  // 4 across at 375/390/430 and 10 across desktop keep 42; 5 across at 430/390/375 and 12 across shrink.
  for(const z of [.387,.407,.464,.386])assert.equal(floor(z),42,`z=${z}`);
  for(const z of [.356,.315,.30,.31])assert.equal(floor(z),24,`z=${z}`);
  // Every cqi value (including the photo clamp, which holds var() and so is never dropped at parse
  // time) sits inside an @supports(width:1cqi) block; outside them only plain px remain.
  const outside=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@supports\(width:1cqi\)\{[\s\S]*?\n\}/g,'');
  assert(!/cqi/.test(outside),'no cqi outside @supports');
  assert.match(css,/\.tile-body\.has-organizer-badge\{position:relative;container-type:inline-size\}/);
  assert.match(css,/\.organizer-card-badge\{float:right;[^}]*width:var\(--logo,42px\)!important;height:var\(--logo,42px\)!important/);
});
test('the logo floats inside the style label so the label wraps beside/below it (no padding column it can overflow)',()=>{
  assert.match(css,/\.tile-body\.has-organizer-badge \.tile-style\{display:flow-root/);
  // Wide Full cards only: the float reaches into the title/details so they wrap beside the bigger logo.
  assert.match(css,/@container \(min-width:420px\)\{#simple-groups\[data-zoom="0"\] \.tile-body\.has-organizer-badge \.tile-style\{display:block\}/);
  assert.match(css,/@container \(min-width:420px\)\{[^\n]*#simple-groups\[data-zoom="0"\] \.tile-body\.has-organizer-badge \.tile-name\{text-wrap:balance\}\}/,"wide Full titles are balanced (no lone 'Outs')");
  assert(!/\.tile-style\{padding-right/.test(css),'old padding-right column removed');
  const src=readFileSync(gc('organizer-badges.mjs'),'utf8');assert.match(src,/querySelector\('\.tile-style'\)/);assert.match(src,/label\.prepend\(img\)/);
  // Style phrases stay together: each " / " part becomes an inline-block span; text is unchanged.
  assert.match(src,/split\(\/\\s\*\\\/\\s\*\/\)/);assert.match(src,/className='tile-style-part'/);
  assert.match(css,/\.tile-body\.has-organizer-badge \.tile-style-part\{display:inline-block;max-width:100%\}/);
});
test('instructor photo badges stay 56px but shrink with compact cards (plain fallback first) and opt out of --logo',()=>{
  assert.match(css,/\.organizer-card-badge\.organizer-card-badge-color\{[^}]*width:56px!important;height:56px!important\}/);
  assert.match(css,/width:calc\(56px \/ var\(--z,\.78\)\)!important;height:calc\(56px \/ var\(--z,\.78\)\)!important\}/);
  assert.match(css,/@supports\(width:1cqi\)\{\n#simple-groups:not\(\[data-zoom=\"0\"\]\) \.organizer-card-badge\.organizer-card-badge-color\{width:clamp\(var\(--logo-min\),61cqi,calc\(56px \/ var\(--z,\.78\)\)\)!important/);
  assert.match(css,/has\(\.organizer-card-badge-color\)[^{]*\{--logo:initial\}/);
});
test('cache-busters match the first 8 sha1 characters of the changed badge files',()=>{
  const h=f=>createHash('sha1').update(readFileSync(gc(f))).digest('hex').slice(0,8);
  assert(readFileSync(gc('index.html'),'utf8').includes('organizer-badges.css?v='+h('organizer-badges.css')));
  assert(readFileSync(gc('index.html'),'utf8').includes('simple-flow.mjs?v='+h('simple-flow.mjs')));
  assert(readFileSync(gc('simple-flow.mjs'),'utf8').includes('organizer-badges.mjs?v='+h('organizer-badges.mjs')));
});
test('portrait badges carry a visible, readable Organizer label; logos do not',async()=>{
  const {organizerLabel}=await import('../../gulfcoast/organizer-badges.mjs');
  assert.equal(organizerLabel(1),'Organizer');assert.equal(organizerLabel(2),'Organizers');
  const src=readFileSync(gc('organizer-badges.mjs'),'utf8');assert.match(src,/if\(item\.card==='photo'\)\{[^}]*className='organizer-card-label'/);
  assert.match(css,/\.organizer-card-label\{float:right;clear:right;[^}]*font:700 11px\/1\.2 var\(--body\);[^}]*color:#25251f/);
  // WCAG AA: #25251f text on the #d8d0bd card must be at least 4.5:1.
  const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  assert((L('#d8d0bd')+.05)/(L('#25251f')+.05)>=4.5);
});
test('pair portrait badges say Organizers; single-person badges say Organizer',async()=>{
  const {badgeLabel}=await import('../../gulfcoast/organizer-badges.mjs');
  for(const id of ['nina-travis','rachel-zander','john-alicia'])assert.equal(badgeLabel(id),'Organizers',id);
  assert.equal(badgeLabel('traci-bell'),'Organizer');
  // Every badge named as a pair ("A & B") or kind 'Instructors' is counted as two people.
  for(const b of BADGES.filter(b=>b.card==='photo'))assert.equal(badgeLabel(b.id),(b.kind==='Instructors'||/&/.test(b.name))?'Organizers':'Organizer',b.id);
  const src=readFileSync(gc('organizer-badges.mjs'),'utf8');assert.match(src,/h\.textContent=badgeLabel\(id\)/);
});
