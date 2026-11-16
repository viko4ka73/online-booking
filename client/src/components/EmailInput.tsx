import {useState,type InputHTMLAttributes} from 'react';
import {emailError,normalizeEmail} from '../lib/email';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:string;onValueChange:(value:string)=>void};
export default function EmailInput({value,onValueChange,className='',...props}:Props){
 const [invalid,setInvalid]=useState(false);
 function validate(input:HTMLInputElement){
  input.setCustomValidity('');
  const message=emailError(input.value,input.required)||(input.validity.typeMismatch?'Укажите почту в формате name@example.ru.':'');
  input.setCustomValidity(message);setInvalid(Boolean(message));
 }
 return <input {...props} type="email" pattern="[^\s@]+@[^\s@]+\.[^\s@]+" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} placeholder={props.placeholder??'name@example.ru'} value={value} aria-invalid={invalid||undefined}
  className={className+' aria-invalid:border-[#b07355]'}
  onChange={event=>{event.currentTarget.setCustomValidity('');setInvalid(false);onValueChange(normalizeEmail(event.target.value));}}
  onBlur={event=>{validate(event.currentTarget);props.onBlur?.(event);}}
  onInvalid={event=>{validate(event.currentTarget);props.onInvalid?.(event);}}/>;
}
