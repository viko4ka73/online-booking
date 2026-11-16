import {useEffect,useState,type FormEvent} from 'react';
import {FiEdit2,FiPlus,FiRefreshCw,FiSave,FiTrash2} from 'react-icons/fi';
import BookingDialog from '../BookingDialog';
import {money} from '../../lib/money';
type Rate={dayType:'weekday'|'weekend';startMinute:number;endMinute:number;hourlyRate:number;extraPlayerHourlyRate:number};
type Sport={id:string;name:string;rates:Rate[]};
type Court={id:number;name:string;sportIds:string[];kind:string;resourceNumber:number;isVip:boolean;hourlySurcharge:number};
type Item={id:string;name:string;unitPrice:number;sportIds:string[];courts:{courtId:number;max:number}[]};
type Data={vipHourlySurcharge:number;version:number;sports:Sport[];courts:Court[];equipment:Item[]};
const field='h-12 w-full min-w-0 rounded-xl border border-[#cdd2c3] bg-white px-3 text-sm text-[#203126] outline-none focus:border-[#69774b] focus:ring-2 focus:ring-[#69774b]/20';
const primary='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#293d30] px-4 text-sm font-semibold text-white hover:bg-[#536b50] disabled:opacity-40';
const minuteTime=(minute:number)=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
const times=Array.from({length:49},(_,i)=>i*30);
async function save(path:string,body:unknown,method='PUT'){
 const response=await fetch('/api/admin/commercial/'+path,{method,credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const payload=await response.json();if(!response.ok)throw Error(payload.error||'Не удалось сохранить изменения.');
 return payload;
}
export default function AdminCommercial({mode,onSaved}:{mode:'prices'|'equipment';onSaved:()=>void}){
 const [result,setResult]=useState<{data?:Data;error?:string}|null>(null);
 const [revision,setRevision]=useState(0),[sport,setSport]=useState('');
 const [editing,setEditing]=useState<Item|'new'|null>(null);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/admin/commercial',{credentials:'include',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setResult({data});}).catch(error=>{if(!controller.signal.aborted)setResult({error:error.message||'Не удалось загрузить данные.'});});
  return()=>controller.abort();
 },[revision]);
 const data=result?.data,selected=data?.sports.find(item=>item.id===sport)??data?.sports[0];
 function saved(message:string){setEditing(null);setNotice(message);setResult(null);setRevision(value=>value+1);onSaved();}
 return <main className="mx-auto w-full max-w-[1600px] space-y-5 px-5 py-5 md:px-10 lg:px-16">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-3xl">{mode==='prices'?'Управление прайсом':'Инвентарь комплекса'}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#647064]">{mode==='prices'?'Тарифы по времени суток для каждого вида спорта. Изменения появятся в прайсе и расчёте новых записей.':'Название, стоимость за единицу за одну игру и доступность на площадках. Ноль означает, что инвентарь не предлагается.'}</p></div><button type="button" onClick={()=>{setResult(null);setRevision(value=>value+1);}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#cdd2c3] px-4 text-sm"><FiRefreshCw/>Обновить данные</button></div>
  <p className="rounded-xl bg-[#e8eddf] p-4 text-xs leading-relaxed text-[#536354]">Стоимость уже созданных бронирований сохранится. При переносе применяется актуальный тариф; новая сумма показывается до подтверждения.</p>
  {notice&&<p role="status" className="text-sm text-[#405640]">{notice}</p>}
  {!result?<p role="status">Загружаем данные…</p>:result.error?<p role="alert" className="text-sm text-[#84523c]">{result.error}</p>:data&&selected&&<>
   <div role="group" aria-label="Вид спорта" className="flex flex-wrap gap-2">{data.sports.map(item=><button key={item.id} type="button" aria-pressed={selected.id===item.id} onClick={()=>setSport(item.id)} className={'min-h-10 rounded-full border px-4 text-sm '+(selected.id===item.id?'border-[#293d30] bg-[#293d30] text-white':'border-[#cdd2c3] hover:bg-[#e8eddf]')}>{item.name}</button>)}</div>
   {mode==='prices'?<><RateEditor key={selected.id+'-'+data.version} sport={selected} version={data.version} onSaved={()=>saved('Тарифы сохранены.')}/>{selected.id==='table-tennis'&&<VipEditor key={data.version} data={data} onSaved={()=>saved('Надбавка для VIP-столов сохранена.')}/>}</>:<>
    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{selected.name}</h3><button type="button" onClick={()=>setEditing('new')} className={primary}><FiPlus/>Добавить инвентарь</button></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.equipment.filter(item=>!item.sportIds.length||item.sportIds.includes(selected.id)).map(item=><article key={item.id} className="rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-5"><h4 className="text-lg font-semibold">{item.name}</h4><p className="mt-2 text-sm">{money(item.unitPrice)} / шт. за игру</p><p className="mt-2 text-xs text-[#748074]">{item.courts.length?'Доступен на площадках: '+item.courts.length:'Скрыт из бронирования'}</p><button type="button" onClick={()=>setEditing(item)} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#526543]"><FiEdit2/>Редактировать</button></article>)}</div>
    {!data.equipment.some(item=>!item.sportIds.length||item.sportIds.includes(selected.id))&&<p className="py-5 text-sm text-[#748074]">Для этого вида спорта инвентарь пока не добавлен.</p>}
   </>}
   {editing&&<EquipmentEditor key={editing==='new'?'new':editing.id} item={editing==='new'?null:editing} selectedSport={selected.id} data={data} onClose={()=>setEditing(null)} onSaved={()=>saved('Инвентарь сохранён.')}/>}
  </>}
 </main>;
}
function RateEditor({sport,version,onSaved}:{sport:Sport;version:number;onSaved:()=>void}){
 const [rates,setRates]=useState(()=>sport.rates.map(rate=>({...rate,price:String(rate.hourlyRate/100),extra:String(rate.extraPlayerHourlyRate/100)})));
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 const original=JSON.stringify(sport.rates),draft=rates.map(({price,extra,...rate})=>({...rate,hourlyRate:Math.round(Number(price)*100),extraPlayerHourlyRate:Math.round(Number(extra)*100)}));
 const changed=JSON.stringify(draft)!==original;
 function update(index:number,change:Partial<typeof rates[number]>){setRates(values=>values.map((value,i)=>i===index?{...value,...change}:value));}
 function split(type:Rate['dayType']){
  const index=rates.findIndex(rate=>rate.dayType===type&&rate.endMinute-rate.startMinute>=60);if(index<0)return;
  const row=rates[index],middle=row.startMinute+Math.floor((row.endMinute-row.startMinute)/60)*30;
  setRates(values=>[...values.slice(0,index),{...row,endMinute:middle},{...row,startMinute:middle},...values.slice(index+1)]);
 }
 function remove(index:number){
  const row=rates[index],previous=rates.findLastIndex((rate,i)=>i<index&&rate.dayType===row.dayType),next=rates.findIndex((rate,i)=>i>index&&rate.dayType===row.dayType);
  setRates(values=>values.map((rate,i)=>i===previous?{...rate,endMinute:row.endMinute}:previous<0&&i===next?{...rate,startMinute:row.startMinute}:rate).filter((_,i)=>i!==index));
 }
 async function submit(event:FormEvent){event.preventDefault();setPending(true);setError('');try{await save('rates/'+sport.id,{version,rates:draft});onSaved();}catch(err){setError(err instanceof Error?err.message:'Не удалось сохранить.');}finally{setPending(false);}}
 return <form onSubmit={submit} className="space-y-5"><fieldset disabled={pending} className="space-y-5">
  {(['weekday','weekend'] as const).map(type=><section key={type} className="rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-4 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{type==='weekday'?'Будние дни':'Выходные дни'}</h3><button type="button" disabled={!rates.some(rate=>rate.dayType===type&&rate.endMinute-rate.startMinute>=60)} onClick={()=>split(type)} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#526543] disabled:opacity-30"><FiPlus/>Добавить интервал</button></div>
   <div className="space-y-3">{rates.map((rate,index)=>rate.dayType!==type?null:<div key={index} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-[#e1e4d8] bg-white/50 p-3 lg:grid-cols-[1fr_1fr_1fr_1fr_40px]">
    <label className="min-w-0 text-xs font-semibold">С<select aria-label={(type==='weekday'?'Будни':'Выходные')+' начало '+(index+1)} className={field+' mt-2'} value={rate.startMinute} onChange={e=>update(index,{startMinute:Number(e.target.value)})}>{times.slice(0,-1).map(time=><option key={time} value={time}>{minuteTime(time)}</option>)}</select></label>
    <label className="min-w-0 text-xs font-semibold">До<select aria-label={(type==='weekday'?'Будни':'Выходные')+' окончание '+(index+1)} className={field+' mt-2'} value={rate.endMinute} onChange={e=>update(index,{endMinute:Number(e.target.value)})}>{times.slice(1).map(time=><option key={time} value={time}>{minuteTime(time)}</option>)}</select></label>
    <label className="min-w-0 text-xs font-semibold">Аренда, ₽/час<input aria-label={'Цена аренды интервала '+(index+1)} required type="number" min="0" max="1000000" step="0.01" value={rate.price} onChange={e=>update(index,{price:e.target.value})} className={field+' mt-2'}/></label>
    <label className="min-w-0 text-xs font-semibold">Доп. игрок, ₽/час<input aria-label={'Цена дополнительного игрока интервала '+(index+1)} required type="number" min="0" max="1000000" step="0.01" value={rate.extra} onChange={e=>update(index,{extra:e.target.value})} className={field+' mt-2'}/></label>
    <button type="button" disabled={rates.filter(r=>r.dayType===type).length<2} onClick={()=>remove(index)} aria-label={'Удалить интервал '+(index+1)} className="grid h-12 place-items-center rounded-xl text-[#84523c] hover:bg-[#f4e9e2] disabled:opacity-25"><FiTrash2/></button>
   </div>)}</div>
  </section>)}
 </fieldset><p className="text-xs text-[#748074]">Интервалы должны покрывать часы работы без пропусков и пересечений. Индивидуальная надбавка VIP-столов прибавляется к тарифу.</p>{error&&<p role="alert" className="text-sm text-[#84523c]">{error}</p>}<button disabled={pending||!changed} className={primary}><FiSave/>{pending?'Сохраняем…':'Сохранить тарифы'}</button></form>;
}
function VipEditor({data,onSaved}:{data:Data;onSaved:()=>void}){
 const original=data.vipHourlySurcharge;
 const [price,setPrice]=useState(String(original/100)),[pending,setPending]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();setPending(true);setError('');try{await save('vip-tables',{version:data.version,hourlySurcharge:Math.round(Number(price)*100)});onSaved();}catch(err){setError(err instanceof Error?err.message:'Не удалось сохранить.');}finally{setPending(false);}}
 return <form onSubmit={submit} className="rounded-2xl border border-[#d8dbce] bg-[#fcfaf4] p-5"><h3 className="text-lg font-semibold">VIP-столы</h3><p className="mt-2 text-xs text-[#748074]">Общая почасовая надбавка к тарифу настольного тенниса.</p><div className="mt-4 flex flex-wrap items-end gap-3"><label className="w-48 text-xs font-semibold">Надбавка, ₽/час<input className={field+' mt-2'} required type="number" min="0" max="1000000" step="0.01" disabled={pending} value={price} onChange={e=>setPrice(e.target.value)}/></label><button disabled={pending||Math.round(Number(price)*100)===original} className={primary}><FiSave/>Сохранить надбавку</button></div>{error&&<p role="alert" className="mt-3 text-sm text-[#84523c]">{error}</p>}</form>;
}
function EquipmentEditor({item,selectedSport,data,onClose,onSaved}:{item:Item|null;selectedSport:string;data:Data;onClose:()=>void;onSaved:()=>void}){
 const [name,setName]=useState(item?.name??''),[price,setPrice]=useState(String((item?.unitPrice??0)/100));
 const [sportIds,setSportIds]=useState(item?.sportIds.length?item.sportIds:[selectedSport]);
 const [quantities,setQuantities]=useState<Record<number,number>>(()=>Object.fromEntries(item?.courts.map(c=>[c.courtId,c.max])??[]));
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 const [bulk,setBulk]=useState(2);
 const courts=data.courts.filter(c=>c.sportIds.some(id=>sportIds.includes(id)));
 async function submit(event:FormEvent){
  event.preventDefault();setPending(true);setError('');
  try{await save(item?'equipment/'+item.id:'equipment',{version:data.version,name,unitPrice:Math.round(Number(price)*100),sportIds,courts:courts.map(c=>({courtId:c.id,max:quantities[c.id]??0}))},item?'PUT':'POST');onSaved();}
  catch(err){setError(err instanceof Error?err.message:'Не удалось сохранить.');}finally{setPending(false);}
 }
 return <BookingDialog open wide pending={pending} onClose={onClose} title={item?'Редактирование инвентаря':'Новый инвентарь'}><form onSubmit={submit} className="space-y-5 p-5 sm:p-7"><fieldset disabled={pending} className="space-y-5">
  <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Название<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, теннисная ракетка" className={field+' mt-2'}/></label><label className="text-sm font-semibold">Цена за шт. за игру, ₽<input required type="number" min="0" max="1000000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className={field+' mt-2'}/></label></div>
  <div><p className="mb-3 text-sm font-semibold">Виды спорта</p><div className="flex flex-wrap gap-2">{data.sports.map(s=><label key={s.id} className={'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm '+(sportIds.includes(s.id)?'border-[#8b9b74] bg-[#e8eddf]':'border-[#d8dbce]')}><input type="checkbox" checked={sportIds.includes(s.id)} onChange={e=>setSportIds(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/>{s.name}</label>)}</div></div>
  <section className="rounded-2xl border border-[#d8dbce] p-4"><h3 className="text-sm font-semibold">Доступность на площадках</h3><p className="mt-2 text-xs leading-relaxed text-[#748074]">Максимум в одной брони. Укажите 0, чтобы скрыть инвентарь на площадке. Это не складской учёт общего запаса комплекса.</p>
   <div className="my-4 flex flex-wrap items-end gap-3"><label className="w-24 text-xs font-semibold">Количество<input aria-label="Количество для всех площадок" type="number" min={0} max={100} value={bulk} onChange={e=>setBulk(Number(e.target.value))} className={field+' mt-2'}/></label><button type="button" disabled={!sportIds.length||!Number.isInteger(bulk)||bulk<0||bulk>100} onClick={()=>setQuantities(previous=>({...previous,...Object.fromEntries(courts.map(c=>[c.id,bulk]))}))} className="min-h-12 rounded-xl border border-[#cdd2c3] px-4 text-sm font-semibold">Применить ко всем</button><button type="button" onClick={()=>setQuantities({})} className="min-h-12 px-3 text-sm text-[#84523c]">Скрыть везде</button></div>
   <div className="grid gap-3 sm:grid-cols-2">{courts.map(c=><label key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#eff1e8] p-3 text-sm"><span>{c.name}</span><input aria-label={'Максимум: '+c.name} required type="number" min={0} max={100} value={quantities[c.id]??0} onChange={e=>setQuantities(previous=>({...previous,[c.id]:Number(e.target.value)}))} className={field+' w-20! shrink-0'}/></label>)}</div>
  </section>
 </fieldset>{error&&<p role="alert" className="text-sm text-[#84523c]">{error}</p>}<div className="flex flex-wrap justify-end gap-3 border-t border-[#dedfd2] pt-4"><button type="button" onClick={onClose} disabled={pending} className="px-4 text-sm">Отмена</button><button disabled={pending||!sportIds.length} className={primary}><FiSave/>{pending?'Сохраняем…':'Сохранить инвентарь'}</button></div></form></BookingDialog>;
}
