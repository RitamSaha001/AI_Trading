import React,{useEffect,useState}from'react';import{useLumen}from'./store';import{ASSETS,Asset}from'./types';import{SettingsModal}from'./Settings';import{ChatDrawer}from'./ChatDrawer';
export type Route='/'|'/markets'|'/portfolio'|'/orders'|'/strategies'|'/alerts'|'/settings';
const VALID_ROUTES:Route[]=['/','/markets','/portfolio','/orders','/strategies','/alerts','/settings'];
function parseRoute():Route{
  if(typeof window==='undefined')return '/';
  if(window.location.hash&&window.location.hash.startsWith('#/')){
    const h=window.location.hash.slice(1);
    if(VALID_ROUTES.includes(h as Route))return h as Route;
  }
  let p=window.location.pathname||'/';
  if(p.includes('/AI_Trading'))p=p.replace('/AI_Trading','');
  p=p.replace(/\/+$/,'')||'/';
  return (VALID_ROUTES.includes(p as Route)?p:'/') as Route;
}
export function useRoute(){
  const[r,setR]=useState<Route>(parseRoute());
  useEffect(()=>{
    const on=()=>setR(parseRoute());
    window.addEventListener('popstate',on);
    window.addEventListener('hashchange',on);
    return()=>{
      window.removeEventListener('popstate',on);
      window.removeEventListener('hashchange',on);
    };
  },[]);
  return r;
}
export function go(path:Route){
  try{
    history.pushState({},'',path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }catch{
    window.location.hash=path;
  }
}
export function Shell({children}:{children:React.ReactNode}){const{state,setSelectedAsset}=useLumen();const route=useRoute();const[settings,setSettings]=useState(false);const[chat,setChat]=useState(false);const[search,setSearch]=useState('');const[notifications,setNotifications]=useState(false);const nav=[['/','Dashboard'],['/markets','Markets'],['/portfolio','Portfolio'],['/orders','Orders'],['/strategies','Strategies'],['/alerts','Alerts']] as const;return <div className="shell"><aside><div className="brand"><div className="brand-mark">✦</div><div><b>Lumen</b><span>AI trading cockpit</span></div></div><div className="nav-group"><div className="nav-label">GENERAL</div>{nav.map(([p,l])=><button key={p} className={route===p?'nav-item active':'nav-item'} onClick={()=>go(p)}><span>{l}</span>{l==='Alerts'&&state.alerts.some(a=>a.enabled&&!a.triggered)?<i/>:null}</button>)}</div><div className="sidebar-foot"><button className="plan-card" onClick={()=>go('/settings')}><strong>Paper Pro</strong><span>Live market data · Gemini</span></button></div></aside><main><header className="topbar"><div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search assets…" onKeyDown={e=>{if(e.key==='Enter'){const q=search.toLowerCase();const x=ASSETS.find(a=>a.toLowerCase().includes(q));if(x){setSelectedAsset(x as Asset);go('/markets')}}}}/></div><div className="top-actions"><button className="icon-btn" onClick={()=>setSettings(true)}>⚙</button><div className="notif-wrap"><button className="icon-btn" onClick={()=>setNotifications(v=>!v)}>◔{state.notifications.length>0&&<em>{state.notifications.length}</em>}</button>{notifications&&<div className="notif-panel">{state.notifications.length?state.notifications.slice(0,10).map(n=><div className="notif-item" key={n.id}><b>{n.title}</b><span>{n.body}</span><small>{new Date(n.ts).toLocaleTimeString()}</small></div>):<div className="empty">No notifications.</div>}</div>}</div><button className="avatar" onClick={()=>setSettings(true)}>RS</button></div></header><div className="content">{children}</div></main>{settings&&<SettingsModal onClose={()=>setSettings(false)}/>}<ChatDrawer open={chat} onClose={()=>setChat(false)}/><button className="copilot-fab" onClick={()=>setChat(true)}>✦ Copilot</button></div>}
