import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
const runtime=process.env.CODEX_ARTIFACT_RUNTIME ?? path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const require=createRequire(runtime);
const sharp=require('sharp');
const root=path.resolve(import.meta.dirname,'../../../..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'public/brand/manifest.json'),'utf8'));
const cells=[];let i=0;
for(const [name,a] of Object.entries(manifest.assets)){
 const x=i%5*240,y=Math.floor(i/5)*245;const file=path.join(root,'public',a.file);
 const svg=await sharp(file,{density:144}).resize({width:210,height:198,fit:'inside'}).png().toBuffer();const meta=await sharp(svg).metadata();
 cells.push({input:svg,left:x+Math.round((240-meta.width)/2),top:y+12});
 const label=Buffer.from(`<svg width="240" height="30"><text x="120" y="20" fill="#5B4636" font-size="12" text-anchor="middle" font-family="Arial">${name.replace('uga-','')}</text></svg>`);
 cells.push({input:label,left:x,top:y+211});i++;
}
const height=Math.ceil(i/5)*245;await sharp({create:{width:1200,height,channels:4,background:'#FAF8F4'}}).composite(cells).png().toFile(path.join(root,'design/uga/system/source/assets-contact-sheet.png'));
console.log('Rendered',i,'assets');
