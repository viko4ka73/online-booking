import {useRef,type InputHTMLAttributes} from 'react';
import {formatRussianPhone} from '../lib/phone';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'|'maxLength'> & {value:string;onValueChange:(value:string)=>void};
export default function PhoneInput({value,onValueChange,...props}:Props){
 const displayValue=formatRussianPhone(value);
 const input=useRef<HTMLInputElement>(null);
 function commit(raw:string,digitPosition:number){
  const next=formatRussianPhone(raw);onValueChange(next);
  queueMicrotask(()=>{const element=input.current;if(!element||document.activeElement!==element)return;let count=0,position=next.length;for(let i=0;i<next.length;i++)if(/\d/.test(next[i])&&++count>=digitPosition){position=i+1;break;}element.setSelectionRange(position,position);});
 }
 return <input {...props} ref={input} type="tel" inputMode="tel" pattern={"\\+7 \\([0-9]{3}\\)\\([0-9]{3}\\)\\([0-9]{2}\\)\\([0-9]{2}\\)"} title="Введите номер полностью: +7 (000)(000)(00)(00)" maxLength={24} placeholder="+7 (000)(000)(00)(00)" value={displayValue}
  onFocus={props.onFocus}
  onChange={event=>{const raw=event.target.value;let position=raw.slice(0,event.target.selectionStart??raw.length).replace(/\D/g,'').length;if(!raw.trim().startsWith('+7')&&raw.replace(/\D/g,'').length<=10&&!(raw.replace(/\D/g,'').length===1&&/^[78]$/.test(raw.replace(/\D/g,''))))position++;commit(raw,position);}}
  onKeyDown={event=>{
   props.onKeyDown?.(event);if(event.defaultPrevented||!['Backspace','Delete'].includes(event.key))return;
   const value=event.currentTarget.value;
   const element=event.currentTarget,start=element.selectionStart??0,end=element.selectionEnd??0;if(start!==end)return;
   if(event.key==='Backspace'&&start<=2){event.preventDefault();if(value.replace(/\D/g,'').length<=1)onValueChange('');else element.setSelectionRange(2,2);return;}
   const backward=event.key==='Backspace';let index=backward?start-1:start;
   if(index<0||index>=value.length||/\d/.test(value[index]))return;
   while(index>=0&&index<value.length&&!/\d/.test(value[index]))index+=backward?-1:1;
   if(index<=1||index>=value.length)return;
   event.preventDefault();const raw=value.slice(0,index)+value.slice(index+1);commit(raw,value.slice(0,index).replace(/\D/g,'').length);
  }}/>;
}
