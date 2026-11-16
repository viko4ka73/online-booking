// Export the existing calendar logo in browser-compatible formats.
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {Resvg}=require('@resvg/resvg-js');
const directory=resolve(__dirname,'../../client/public');
const svg=readFileSync(resolve(directory,'igraem-calendar-favicon.svg'),'utf8');
const render=size=>new Resvg(svg,{fitTo:{mode:'width',value:size}}).render();
const png=render(32).asPng();
writeFileSync(resolve(directory,'igraem-calendar-icon.png'),png);
writeFileSync(resolve(directory,'apple-touch-icon.png'),render(180).asPng());
// Classic uncompressed 32-bit ICO entries also work in browsers without PNG-in-ICO support.
const sizes=[16,32,48];
const images=sizes.map(size=>{
 const pixels=render(size).pixels,maskStride=Math.ceil(size/32)*4;
 const bitmap=Buffer.alloc(40+size*size*4+maskStride*size);
 bitmap.writeUInt32LE(40,0);bitmap.writeInt32LE(size,4);bitmap.writeInt32LE(size*2,8);
 bitmap.writeUInt16LE(1,12);bitmap.writeUInt16LE(32,14);bitmap.writeUInt32LE(size*size*4,20);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const source=(y*size+x)*4,destination=40+((size-1-y)*size+x)*4;
  bitmap[destination]=pixels[source+2];bitmap[destination+1]=pixels[source+1];bitmap[destination+2]=pixels[source];bitmap[destination+3]=pixels[source+3];
  if(pixels[source+3]===0)bitmap[40+size*size*4+(size-1-y)*maskStride+Math.floor(x/8)]|=128>>(x%8);
 }
 return bitmap;
});
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
for(let i=0;i<sizes.length;i++){
 const entry=6+i*16;header[entry]=sizes[i];header[entry+1]=sizes[i];
 header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
 header.writeUInt32LE(images[i].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=images[i].length;
}
const ico=Buffer.concat([header,...images]);
for(const file of ['favicon.ico','igraem-calendar-icon.ico'])writeFileSync(resolve(directory,file),ico);
console.log('Generated calendar PNG, classic ICO and Apple touch icon.');
