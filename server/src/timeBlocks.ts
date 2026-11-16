import type {PoolClient} from 'pg';
import {formatTime} from './booking';
export type TimeBlockRow={id:string;court_id:number;play_date:string;start_minute:number;end_minute:number;reason:string;status:'active'|'released';version:number;created_by:string;request_key:string;created_at:Date;released_at:Date|null;released_by:string|null;court_name:string;creator_name:string|null};
export const blockFields="b.*,to_char(b.play_date,'YYYY-MM-DD') AS play_date,c.name AS court_name,u.name AS creator_name";
export const blockFrom="FROM court_time_blocks b JOIN courts c ON c.id=b.court_id LEFT JOIN app_users u ON u.id=b.created_by";
export function publicTimeBlock(row:TimeBlockRow){
 return {id:row.id,courtId:row.court_id,courtName:row.court_name,date:row.play_date,start:formatTime(row.start_minute),end:formatTime(row.end_minute),reason:row.reason,status:row.status,version:row.version,createdBy:row.creator_name,createdAt:row.created_at,releasedAt:row.released_at};
}
export async function loadTimeBlock(db:Pick<PoolClient,'query'>,id:string,lock=false){
 return (await db.query<TimeBlockRow>('SELECT '+blockFields+' '+blockFrom+' WHERE b.id=$1'+(lock?' FOR UPDATE OF b':''),[id])).rows[0];
}
