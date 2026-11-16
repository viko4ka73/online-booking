import { resolve } from "node:path";
import { mkdir,writeFile,unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const COURT_IMAGE_DIR = resolve(__dirname,"../uploads/courts");
export function decodeCourtImage(value: string): {bytes:Buffer;extension:string} | null {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > Math.ceil(2*1024*1024/3)*4) return null;
  const bytes = Buffer.from(match[2],"base64");
  if (!bytes.length || bytes.length > 2*1024*1024 || bytes.toString("base64").replace(/=+$/,"") !== match[2].replace(/=+$/,"")) return null;
  const valid = match[1] === "png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : match[1] === "jpeg" ? bytes.subarray(0,3).equals(Buffer.from([255,216,255]))
    : bytes.length >= 12 && bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP";
  return valid ? {bytes,extension:match[1] === "jpeg" ? "jpg" : match[1]} : null;
}
export async function storeCourtImage(image: {bytes:Buffer;extension:string}) {
  await mkdir(COURT_IMAGE_DIR,{recursive:true});
  const filename = `${randomUUID()}.${image.extension}`;
  const path = resolve(COURT_IMAGE_DIR,filename);
  await writeFile(path,image.bytes,{flag:"wx"});
  return {url:`/uploads/courts/${filename}`,path};
}
export async function discardCourtImage(path: string) {
  await unlink(path).catch(()=>{});
}

export function isPresetCourtImage(value:string){return value==='/images/badminton/court-2-v2.jpg' || /^\/images\/(?:halls\/hall-[1-7]|badminton\/court-[1-6]|table-tennis\/table-[1-9])\.jpg$/.test(value) || ['/images/home/badminton.png','/images/home/table-tennis.png','/images/home/volleyball.png'].includes(value);}
