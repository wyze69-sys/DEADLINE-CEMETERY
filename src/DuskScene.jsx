import React,{useEffect,useState} from 'react';

export function useMotionPreference(){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('cemetery-motion')!=='off';}catch{return true;}});
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{document.documentElement.dataset.motion=enabled&&!reduced?'on':'off';},[enabled,reduced]);
 useEffect(()=>{const update=()=>{document.documentElement.dataset.pageHidden=String(document.hidden);};update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 function toggle(){const next=!enabled;setEnabled(next);try{localStorage.setItem('cemetery-motion',next?'on':'off');}catch{/* The control still works if storage is unavailable. */}}
 return {on:enabled&&!reduced,toggle,reduced};
}

// Original local artwork. Motion is CSS-only and never drives application state.
export function DuskScene(){return <svg className="dusk-scene" viewBox="0 0 540 230" fill="none" aria-hidden="true" focusable="false">
 <defs><linearGradient id="dusk-sky" x2="0" y2="230" gradientUnits="userSpaceOnUse"><stop stopColor="#383043"/><stop offset="1" stopColor="#1c1a28"/></linearGradient><radialGradient id="lamp-halo"><stop stopColor="#e8ba77" stopOpacity=".3"/><stop offset="1" stopColor="#e8ba77" stopOpacity="0"/></radialGradient><linearGradient id="fog-fade"><stop stopColor="#ada7b7" stopOpacity="0"/><stop offset=".5" stopColor="#ada7b7" stopOpacity=".14"/><stop offset="1" stopColor="#ada7b7" stopOpacity="0"/></linearGradient></defs>
 <path d="M0 100Q110 15 270 30T540 60V230H0Z" fill="url(#dusk-sky)"/>
 <circle cx="386" cy="63" r="33" fill="#dedbd2"/><path d="M373 37q-17 32 18 53a32 32 0 0 1-18-53" fill="#bbb7be"/>
 <g className="scene-cloud" fill="#383242"><path d="M279 72q22-11 43-2t51 1q21-7 52 2t56 0q-42 14-98 8t-104-9"/><path d="M80 64q45-13 87-2t74-1q-18 13-76 9T80 64" opacity=".6"/></g>
 <path d="M0 157Q100 103 205 137T392 138T540 120V230H0Z" fill="#343042"/>
 <g fill="#494052"><path d="M94 155v-27a13 13 0 0 1 26 0v27z" transform="rotate(-9 107 155)"/><path d="M298 155v-32h8v-10h8v10h8v8h-8v24z"/><path d="M452 148v-19a10 10 0 0 1 20 0v19z"/></g>
 <path d="M0 192q101-38 218-16t322-9v63H0" fill="#211f2d"/>
 <g stroke="#211f2d" strokeLinecap="round"><path d="M49 192 61 45M58 102 26 72M58 112 92 74M60 73 80 51M37 83 22 48M73 96 104 91" strokeWidth="5"/><path d="m26 72-14-5m79 8 6-24M60 61 49 30" strokeWidth="2"/></g>
 <g fill="#514759" stroke="#8c7a91" strokeWidth="1"><path d="m164 189-3-38c-2-28 36-30 38-3l3 38z"/><path d="m245 193 3-27c2-23 33-21 31 3l-3 28z" fill="#393341"/></g>
 <path d="m171 156 18-1m-15 7 12-1m71 11 13 1" stroke="#a99aa9" opacity=".65"/>
 <g stroke="#645969"><path d="M369 192v-54m58 48v-48m-58 10h58m-58 10h58m-48-20v50m12-50v50m12-50v50"/><path d="M362 192v-63h10v63m50-4v-59h10v59" strokeWidth="2"/></g>
 <path d="M0 213q126-28 260-4t280-6v27H0Z" fill="#14131e"/>
 <g className="scene-fog"><path d="M-35 185q125-25 253-7t340-3v16q-153 10-293-1t-300 9z" fill="url(#fog-fade)"/></g>
 <g className="scene-lantern"><circle cx="362" cy="137" r="36" fill="url(#lamp-halo)"/><path d="M356 130h12l-2 15h-8z" fill="#e8ba77" fillOpacity=".8"/><path d="m354 129 8-7 8 7m-12 16h8m-4-14v12" stroke="#a78d70" strokeWidth="2"/></g>
 <path d="m130 215 4-14 2 12 6-7m166 14 2-13 4 11 4-6m168 2 4-12 1 11" stroke="#4d4656"/>
 </svg>;}

export function TaskProgress({complete,total,title}){return <div className="task-progress" role="progressbar" aria-label={title+' progress'} aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={complete}><span style={{transform:`scaleX(${total?complete/total:0})`}}/></div>;}
