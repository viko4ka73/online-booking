import { useEffect,type Dispatch,type SetStateAction } from 'react';

export function useAdminAutoRefresh(setRefresh:Dispatch<SetStateAction<number>>,enabled=true){
  useEffect(()=>{
    if(!enabled)return;
    const update=()=>{if(document.visibilityState==='visible')setRefresh(value=>value+1);};
    const timer=window.setInterval(update,30000);
    document.addEventListener('visibilitychange',update);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update);};
  },[setRefresh,enabled]);
}
