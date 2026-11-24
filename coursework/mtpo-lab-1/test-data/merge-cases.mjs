// Type-aware key: JSON.stringify alone would collapse NaN/Infinity to null.
function scalar(value){
 if(value===undefined)return ['undefined'];
 if(typeof value==='number')return ['number',Number.isNaN(value)?'NaN':Object.is(value,-0)?'-0':String(value)];
 return [typeof value,value];
}
export function caseKey(date,duration){return JSON.stringify([scalar(date),scalar(duration)]);}
export function mergeCases(cases){
 const unique=new Map();
 for(const [id,technique,date,duration,expected] of cases){
  const key=caseKey(date,duration),previous=unique.get(key);
  if(previous){
   if(previous.expected!==expected)throw new Error('Conflicting expected results for '+id);
   previous.ids.push(id);if(!previous.techniques.includes(technique))previous.techniques.push(technique);
  }else unique.set(key,{date,duration,expected,ids:[id],techniques:[technique]});
 }
 return [...unique.values()];
}
