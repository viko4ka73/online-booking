// Shared validation for creation and editing; only their request metadata differs.
export function parseCourtFields(body: unknown, extraKeys: string[]):
  { error: string } | { values: Record<string,string>; image: string; capacity: number } {
  const limits: Record<string,[number,number]> = {name:[2,100],sportId:[1,80],hallId:[1,80],description:[10,3000],dimensions:[1,120],surface:[2,200],equipmentDescription:[0,2000]};
  if (!body || typeof body!=="object" || Array.isArray(body)) return {error:"Проверьте данные площадки."};
  const input = body as Record<string,unknown>;
  const allowed = [...Object.keys(limits),"image","capacity",...extraKeys];
  if (Object.keys(input).some(key=>!allowed.includes(key))) return {error:"Проверьте данные площадки."};
  const values: Record<string,string> = {};
  for (const [key,[min,max]] of Object.entries(limits)) {
    const value = input[key];
    if (typeof value!=="string" || value.trim().length<min || value.trim().length>max) return {error:"Заполните название, описание и характеристики площадки в пределах указанной длины."};
    values[key]=value.trim();
  }
  if (typeof input.capacity!=="number" || !Number.isInteger(input.capacity) || input.capacity<1 || input.capacity>100 || typeof input.image!=="string") return {error:"Укажите корректную вместимость и фотографию."};
  return {values,image:input.image,capacity:input.capacity};
}
