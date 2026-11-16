export function formatRussianPhone(value:string){
 let digits=value.replace(/\D/g,'');
 if((digits.length>10||digits.length===1)&&(digits.startsWith('7')||digits.startsWith('8')))digits=digits.slice(1);
 else if(value.trim().startsWith('+7'))digits=digits.slice(1);
 digits=digits.slice(0,10);
 if(!digits)return value.replace(/\D/g,'')?'+7':'';
 const groups=[digits.slice(0,3),digits.slice(3,6),digits.slice(6,8),digits.slice(8,10)].filter(Boolean);
 return '+7 '+groups.map((group,index)=>'('+group+(group.length===(index<2?3:2)?')':'')).join('');
}
