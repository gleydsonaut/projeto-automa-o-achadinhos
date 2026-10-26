import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=join(root,'extension'),output=join(root,'extension-builds');
const files=['popup.html','popup.css','popup.js'];
const base=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function zip(entries){const parts=[],central=[];let offset=0;for(const [name,content]of entries){const path=Buffer.from(name),crc=crc32(content);const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt32LE(crc,14);header.writeUInt32LE(content.length,18);header.writeUInt32LE(content.length,22);header.writeUInt16LE(path.length,26);parts.push(header,path,content);const index=Buffer.alloc(46);index.writeUInt32LE(0x02014b50);index.writeUInt16LE(20,4);index.writeUInt16LE(20,6);index.writeUInt16LE(0x800,8);index.writeUInt32LE(crc,16);index.writeUInt32LE(content.length,20);index.writeUInt32LE(content.length,24);index.writeUInt16LE(path.length,28);index.writeUInt32LE(offset,42);central.push(index,path);offset+=header.length+path.length+content.length;}const table=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(table.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,table,end]);}
await mkdir(output,{recursive:true});
for(const target of ['chromium','firefox','safari']){
  const directory=join(output,target);await mkdir(directory,{recursive:true});const manifest=structuredClone(base);
  if(target==='firefox')manifest.browser_specific_settings={gecko:{id:'ofertalab-local@ofertalab.invalid',strict_min_version:'140.0',data_collection_permissions:{required:['websiteContent']}}};
  const entries=[['manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')],...await Promise.all(files.map(async file=>[file,await readFile(join(source,file))]))];
  for(const [name,content]of entries)await writeFile(join(directory,name),content);
  await writeFile(join(output,`ofertalab-${target}.zip`),zip(entries));
  console.log(`${target}: ${directory}`);
}
console.log('Safari: fontes preparadas. A compilação nativa requer Xcode completo. Consulte extension/README.md.');
