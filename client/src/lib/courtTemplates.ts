import type {CourtDirectory,ManagedCourt} from '../components/admin/types';
export type CourtDraft={kind:'court'|'table'|'whole';name:string;sportId:string;hallId:string;image:string;capacity:number;description:string;dimensions:string;surface:string;equipmentDescription:string;resourceNumber:number;sportIds:string[];vip:boolean};
const presets:Record<string,{capacity:number;dimensions:string;surface:string;description:string;equipment:string;image:string}>={
  badminton:{capacity:4,dimensions:'13,4 × 6,1 м',surface:'Спортивное покрытие ПВХ',description:'Отдельная крытая площадка для одиночной и парной игры в бадминтон.',equipment:'Установлена сетка. Ракетки и воланы можно принести с собой.',image:'badminton'},
  'table-tennis':{capacity:4,dimensions:'8 × 5 м',surface:'Спортивный линолеум',description:'Стол в общем игровом ряду для одиночной и парной игры в настольный теннис.',equipment:'Стол и сетка установлены. Ракетки и мячи можно принести с собой.',image:'table-tennis'},
  football:{capacity:12,dimensions:'36 × 18 м',surface:'Спортивное покрытие',description:'Крытый зал для командных игр и тренировок по мини-футболу.',equipment:'В зале установлены футбольные ворота. Свой мяч можно принести с собой.',image:'volleyball'},
  volleyball:{capacity:12,dimensions:'18 × 9 м',surface:'Спортивный паркет',description:'Крытый волейбольный зал для командных игр и тренировок.',equipment:'Установлена волейбольная сетка. Свой мяч можно принести с собой.',image:'volleyball'},
  basketball:{capacity:12,dimensions:'28 × 15 м',surface:'Спортивный паркет',description:'Крытый баскетбольный зал для командных игр и тренировок бросков.',equipment:'Установлены баскетбольные кольца. Свой мяч можно принести с собой.',image:'volleyball'},
  tennis:{capacity:4,dimensions:'23,77 × 10,97 м',surface:'Спортивное покрытие',description:'Крытый теннисный корт для одиночных и парных игр.',equipment:'Установлена теннисная сетка. Ракетки и мячи можно принести с собой.',image:'volleyball'},
};
export function courtDraftTemplate(directory:CourtDirectory,sportId:string,number?:number,sportIds=[sportId],vip=false):CourtDraft{
  const selected=directory.sports.find(s=>s.id===sportId)??directory.sports[0];
  const id=selected?.id??'badminton',preset=presets[id]??presets.badminton;
  const kind=id==='badminton'?'court':id==='table-tennis'?'table':'whole';
  const hall=directory.halls.find(h=>h.rentalMode!=='whole'&&(h.id===(id==='badminton'?'badminton-hall':'table-tennis-hall')))
    ??directory.halls.find(h=>h.rentalMode!=='whole'&&(!h.sportIds?.length||h.sportIds.includes(id)));
  const candidates=directory.courts.filter(c=>kind==='whole'?c.kind==='whole':c.hallId===hall?.id);
  const next=directory.nextNumbers?.[kind==='whole'?'whole':id]??Math.max(0,...candidates.map(c=>c.resourceNumber??0))+1;
  const resourceNumber=number??next;
  const ids=kind==='whole'?[...new Set([id,...sportIds.filter(s=>directory.sports.some(item=>item.id===s))])]:[id];
  const isVip=kind==='table'&&vip;
  const name=kind==='table'?`Стол №${resourceNumber}${isVip?' · VIP':''}`:kind==='court'?`Бадминтон №${resourceNumber}`:`${id==='tennis'?'Корт':'Зал'} №${resourceNumber}`;
  return {kind,name,sportId:id,hallId:kind==='whole'?'new':hall?.id??'',image:kind==='whole'?`/images/halls/hall-${((resourceNumber-1)%7)+1}.jpg`:kind==='court'?(resourceNumber===2?'/images/badminton/court-2-v2.jpg':`/images/badminton/court-${((resourceNumber-1)%6)+1}.jpg`):`/images/table-tennis/table-${isVip?((resourceNumber-1)%2)+1:((Math.max(3,resourceNumber)-3)%7)+3}.jpg`,
    capacity:Math.max(preset.capacity,...directory.sports.filter(s=>ids.includes(s.id)).map(s=>s.minPlayers)),resourceNumber,sportIds:ids,vip:isVip,
    description:isVip?'Отдельно расположенный стол с увеличенным пространством для игры.':ids.length>1?`Универсальный зал для видов спорта: ${directory.sports.filter(s=>ids.includes(s.id)).map(s=>s.name.toLowerCase()).join(', ')}. Все форматы используют одно пространство и общее расписание.`:preset.description,
    dimensions:isVip?'Отдельная просторная игровая зона':ids.length>1?'36 × 18 м':preset.dimensions,surface:preset.surface,
    equipmentDescription:ids.length>1?'Оборудование подготавливается под выбранный вид спорта. Свой инвентарь можно принести с собой.':preset.equipment};
}
export function existingCourtDraft(directory:CourtDirectory,court:ManagedCourt):CourtDraft{
  return {...courtDraftTemplate(directory,court.sportId),kind:court.kind??'court',name:court.name,sportId:court.sportId,hallId:court.hallId,image:court.image,capacity:court.capacity,description:court.description,dimensions:court.dimensions,surface:court.surface,equipmentDescription:court.equipmentDescription,resourceNumber:court.resourceNumber??1,sportIds:court.sports?.map(s=>s.id)??[court.sportId],vip:(court.hourlySurcharge??0)>0};
}
