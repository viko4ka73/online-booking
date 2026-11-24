// Fixed, specification-based criteria: the same denominator for every technique.
export const coverageItems=[
 ['K01','Дата не является строкой'],['K02','Неверный формат даты'],['K03','Несуществующая календарная дата'],['K04','Прошедшая дата'],['K05','Дата за горизонтом 40 дней'],
 ['K06','Длительность не является числом'],['K07','Числовая длительность не является целой'],['K08','Длительность меньше 60'],['K09','Длительность больше 300'],['K10','Нарушение шага внутри диапазона'],
 ['K11','Допустимая сегодняшняя дата'],['K12','Допустимая будущая дата'],['K13','Допустимый минимум 60 минут'],['K14','Допустимый максимум 300 минут'],['K15','Допустимая последняя дата +40 дней'],
];
export function reachedItems([id,technique,date,duration,expected]){
 const items=[];
 if(typeof date!=='string')return ['K01'];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return ['K02'];
 const parsed=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return ['K03'];
 const today='2026-11-24',last='2027-01-03';
 if(date<today)return ['K04'];if(date>last)return ['K05'];
 if(typeof duration!=='number')return ['K06'];if(!Number.isInteger(duration))return ['K07'];
 if(duration<60)return ['K08'];if(duration>300)return ['K09'];if(duration%30!==0)return ['K10'];
 if(expected!==null)throw new Error('Input criterion contradicts the expected result of '+id);
 items.push(date===today?'K11':'K12');
 if(duration===60)items.push('K13');if(duration===300)items.push('K14');if(date===last)items.push('K15');
 return items;
}
