export function adminSearchPatterns(query:string){
  const value=query.trim();
  const pattern=value?`%${value.replace(/[\\%_]/g,'\\$&')}%`:null;
  let digits=/^[+\d\s().-]+$/.test(value)?value.replace(/\D/g,''):'';
  if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
  return {pattern,phonePattern:digits.length>=3?`%${digits}%`:null};
}

// The same predicate is used before both counts and pagination.
export const adminBookingSearch=`($4::text IS NULL OR r.id::text ILIKE $4 OR r.guest_name ILIKE $4 OR ($5::text IS NOT NULL AND (CASE
 WHEN regexp_replace(COALESCE(r.guest_phone,''),'[^0-9]','','g') ~ '^8[0-9]{10}$'
 THEN '7'||substring(regexp_replace(r.guest_phone,'[^0-9]','','g') FROM 2)
 ELSE regexp_replace(COALESCE(r.guest_phone,''),'[^0-9]','','g') END) LIKE $5) OR EXISTS(
  SELECT 1 FROM app_users search_user WHERE search_user.id=r.user_id AND (
    search_user.name ILIKE $4 OR search_user.email ILIKE $4 OR
    ($5::text IS NOT NULL AND (CASE
      WHEN regexp_replace(COALESCE(search_user.phone,''),'[^0-9]','','g') ~ '^8[0-9]{10}$'
      THEN '7'||substring(regexp_replace(search_user.phone,'[^0-9]','','g') FROM 2)
      ELSE regexp_replace(COALESCE(search_user.phone,''),'[^0-9]','','g') END) LIKE $5)
  )
))`;
