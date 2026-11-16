export function normalizeEmail(value:string){
 return value.replace(/\s/g,'').toLowerCase();
}
export function emailError(value:string,required=false){
 if(!value)return required?'Введите электронную почту.':'';
 if(value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return 'Укажите почту в формате name@example.ru.';
 return '';
}
