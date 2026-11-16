import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
export default function RouteScroll(){
 const {pathname,search,hash}=useLocation();
 useEffect(()=>{
  const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto' as const:'smooth' as const;
  let observer:MutationObserver|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
  const frame=requestAnimationFrame(()=>{
   let id='';try{id=decodeURIComponent(hash.slice(1));}catch{id=hash.slice(1);}
   const scrollToHash=()=>{const target=id?document.getElementById(id):null;if(!target)return false;target.scrollIntoView({behavior});return true;};
   if(scrollToHash())return;
   window.scrollTo({top:0,behavior});
   if(id){observer=new MutationObserver(()=>{if(scrollToHash()){observer?.disconnect();clearTimeout(timer);}});observer.observe(document.body,{childList:true,subtree:true});timer=setTimeout(()=>observer?.disconnect(),5000);}
  });return ()=>{cancelAnimationFrame(frame);observer?.disconnect();clearTimeout(timer);};
 },[pathname,search,hash]);return null;
}
