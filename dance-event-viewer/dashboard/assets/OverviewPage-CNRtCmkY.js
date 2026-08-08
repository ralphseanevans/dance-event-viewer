import{$ as e,C as t,D as n,G as r,Q as i,R as a,S as o,Z as s,a as c,c as l,ft as u,gt as d,h as f,i as p,n as m,o as h,ot as g,pt as _,r as v,st as y,w as b}from"./supabase-Byv63ZSS.js";function x(e){return String(e).match(/[\d.\-+]*\s*(.*)/)[1]||``}function S(e){return parseFloat(e)}function C(e){return i(`MuiSkeleton`,e)}s(`MuiSkeleton`,[`root`,`text`,`rectangular`,`rounded`,`circular`,`pulse`,`wave`,`withChildren`,`fitContent`,`heightAuto`]);var w=d(_()),T=u(),E=e=>{let{classes:t,variant:n,animation:r,hasChildren:i,width:o,height:s}=e;return a({root:[`root`,n,r,i&&`withChildren`,i&&!o&&`fitContent`,i&&!s&&`heightAuto`]},C,t)},D=y`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }

  100% {
    opacity: 1;
  }
`,O=y`
  0% {
    transform: translateX(-100%);
  }

  50% {
    /* +0.5s of delay between each loop */
    transform: translateX(100%);
  }

  100% {
    transform: translateX(100%);
  }
`,k=typeof D==`string`?null:g`
        animation: ${D} 2s ease-in-out 0.5s infinite;
      `,A=typeof O==`string`?null:g`
        &::after {
          animation: ${O} 2s linear 0.5s infinite;
        }
      `,j=n(`span`,{name:`MuiSkeleton`,slot:`Root`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.root,t[n.variant],n.animation!==!1&&t[n.animation],n.hasChildren&&t.withChildren,n.hasChildren&&!n.width&&t.fitContent,n.hasChildren&&!n.height&&t.heightAuto]}})(b(({theme:e})=>{let t=x(e.shape.borderRadius)||`px`,n=S(e.shape.borderRadius);return{display:`block`,backgroundColor:e.vars?e.vars.palette.Skeleton.bg:r(e.palette.text.primary,e.palette.mode===`light`?.11:.13),height:`1.2em`,variants:[{props:{variant:`text`},style:{marginTop:0,marginBottom:0,height:`auto`,transformOrigin:`0 55%`,transform:`scale(1, 0.60)`,borderRadius:`${n}${t}/${Math.round(n/.6*10)/10}${t}`,"&:empty:before":{content:`"\\00a0"`}}},{props:{variant:`circular`},style:{borderRadius:`50%`}},{props:{variant:`rounded`},style:{borderRadius:(e.vars||e).shape.borderRadius}},{props:({ownerState:e})=>e.hasChildren,style:{"& > *":{visibility:`hidden`}}},{props:({ownerState:e})=>e.hasChildren&&!e.width,style:{maxWidth:`fit-content`}},{props:({ownerState:e})=>e.hasChildren&&!e.height,style:{height:`auto`}},{props:{animation:`pulse`},style:k||{animation:`${D} 2s ease-in-out 0.5s infinite`}},{props:{animation:`wave`},style:{position:`relative`,overflow:`hidden`,WebkitMaskImage:`-webkit-radial-gradient(white, black)`,"&::after":{background:`linear-gradient(
                90deg,
                transparent,
                ${(e.vars||e).palette.action.hover},
                transparent
              )`,content:`""`,position:`absolute`,transform:`translateX(-100%)`,bottom:0,left:0,right:0,top:0}}},{props:{animation:`wave`},style:A||{"&::after":{animation:`${O} 2s linear 0.5s infinite`}}}]}})),M=w.forwardRef(function(n,r){let i=t({props:n,name:`MuiSkeleton`}),{animation:a=`pulse`,className:o,component:s=`span`,height:c,style:l,variant:u=`text`,width:d,...f}=i,p={...i,animation:a,component:s,variant:u,hasChildren:!!f.children},m=E(p);return(0,T.jsx)(j,{as:s,ref:r,className:e(m.root,o),ownerState:p,...f,style:{width:d,height:c,...l}})}),N=o((0,T.jsx)(`path`,{d:`M16.53 11.06 15.47 10l-4.88 4.88-2.12-2.12-1.06 1.06L10.59 17zM19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H5V8h14z`}),`EventAvailable`),P=o((0,T.jsx)(`path`,{d:`M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m0 4c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3m6 12H6v-1.4c0-2 4-3.1 6-3.1s6 1.1 6 3.1z`}),`AssignmentInd`),F=o((0,T.jsx)(`path`,{d:`M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z`}),`History`),I=o((0,T.jsx)(`path`,{d:`M19.3 16.9c.4-.7.7-1.5.7-2.4 0-2.5-2-4.5-4.5-4.5S11 12 11 14.5s2 4.5 4.5 4.5c.9 0 1.7-.3 2.4-.7l3.2 3.2 1.4-1.4zm-3.8.1c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5M12 20v2C6.48 22 2 17.52 2 12S6.48 2 12 2c4.84 0 8.87 3.44 9.8 8h-2.07c-.64-2.46-2.4-4.47-4.73-5.41V5c0 1.1-.9 2-2 2h-2v2c0 .55-.45 1-1 1H8v2h2v3H9l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.41 3.59 8 8 8`}),`TravelExplore`);function L({profile:e}){let[t,n]=(0,w.useState)(null),[r,i]=(0,w.useState)(``),a=e.role===`owner_admin`||e.role===`volunteer_admin`;(0,w.useEffect)(()=>{let e=a?`dashboard_events_admin`:`dashboard_events`;Promise.all([m.from(e).select(`id`,{count:`exact`,head:!0}),m.from(`event_assignments`).select(`id`,{count:`exact`,head:!0}).eq(`active`,!0),m.from(`dashboard_activity`).select(`id`,{count:`exact`,head:!0}),m.from(`dashboard_source_history`).select(`id`,{count:`exact`,head:!0})]).then(e=>{let t=e.find(e=>e.error)?.error;t&&i(t.message),n({events:e[0].count??0,assignments:e[1].count??0,activity:e[2].count??0,sources:e[3].count??0})})},[a]);let o=[{label:a?`All event records`:`Assigned event records`,value:t?.events,icon:(0,T.jsx)(N,{color:`primary`})},{label:a?`Active assignments`:`Your assignments`,value:t?.assignments,icon:(0,T.jsx)(P,{color:`secondary`})},{label:`Visible activity entries`,value:t?.activity,icon:(0,T.jsx)(F,{color:`warning`})},{label:`Source observations`,value:t?.sources,icon:(0,T.jsx)(I,{color:`success`})}];return(0,T.jsxs)(v,{spacing:3,children:[(0,T.jsx)(p,{children:(0,T.jsxs)(v,{direction:{xs:`column`,sm:`row`},justifyContent:`space-between`,gap:1,children:[(0,T.jsxs)(p,{children:[(0,T.jsx)(h,{variant:`h4`,component:`h1`,children:`Welcome back`}),(0,T.jsx)(h,{color:`text.secondary`,mt:.5,children:e.role===`owner_admin`?`You have full owner access.`:a?`You have overall day-to-day admin access.`:`Only assigned records are visible and editable.`})]}),(0,T.jsx)(c,{label:`Supabase RLS enforced`,color:`success`,variant:`outlined`,sx:{alignSelf:`flex-start`}})]})}),r&&(0,T.jsx)(l,{severity:`error`,children:r}),(0,T.jsx)(p,{className:`stat-grid`,children:o.map(e=>(0,T.jsxs)(f,{sx:{p:2.5,minHeight:145},children:[(0,T.jsxs)(v,{direction:`row`,justifyContent:`space-between`,alignItems:`flex-start`,children:[(0,T.jsx)(h,{color:`text.secondary`,fontWeight:650,children:e.label}),e.icon]}),t?(0,T.jsx)(h,{variant:`h3`,mt:2,fontWeight:850,children:e.value}):(0,T.jsx)(M,{width:80,height:64})]},e.label))}),(0,T.jsxs)(f,{sx:{p:3},children:[(0,T.jsx)(h,{variant:`h6`,gutterBottom:!0,children:`Security model`}),(0,T.jsx)(h,{color:`text.secondary`,children:`Authentication proves identity. Database profiles define roles. Active assignments define volunteer access. The database rejects unauthorized requests even if someone bypasses this interface.`})]})]})}export{L as default};