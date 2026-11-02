// Prepara los insumos para la web antes de compilar (npm run build):
//  - une los directorios (insumos.json), las fichas ampliadas (insumos-detalles.json)
//    y los certificados comprobados a mano (insumos-manuales.json);
//  - genera una lista ligera para buscar y filtrar (generado/insumos-lista.json)
//  - y las fichas completas repartidas en partes (generado/insumos-fichas-NN.json),
//    que la web solo descarga al abrir una ficha o exportar.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {foldInput} from '../lib/inputs-core.mjs';

export const SHARDS=32;
const DATA=new URL('../public/data/',import.meta.url),OUT=new URL('generado/',DATA);
const read=async n=>JSON.parse(await readFile(new URL(n,DATA),'utf8'));
const optional=async n=>{try{return await read(n)}catch{return null}};
export const shardOf=id=>{let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))>>>0;return h%SHARDS;};
const key=(name,manufacturer)=>foldInput(name)+'|'+foldInput(manufacturer);

export function validateManual(manual){
 const errors=[];
 for(const [i,p] of (manual?.products||[]).entries()){
  const where='insumos-manuales.json producto '+(i+1)+' ('+(p?.name||'sin nombre')+')';
  if(!p?.name||!p?.manufacturer||!p?.type)errors.push(where+': falta nombre, fabricante o tipo');
  const ev=p?.evidence||[];if(!ev.length)errors.push(where+': falta el certificado');
  for(const e of ev){
   if(e.verification!=='manual')errors.push(where+': verification debe ser "manual"');
   if(!e.issuer||!e.scheme)errors.push(where+': falta certificadora o norma');
   if(!/^https:\/\//.test(e.sourceUrl||''))errors.push(where+': falta el enlace al certificado (https)');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(e.validUntil||''))errors.push(where+': falta la fecha de caducidad (AAAA-MM-DD)');
   if(e.validFrom&&!/^\d{4}-\d{2}-\d{2}$/.test(e.validFrom))errors.push(where+': fecha de inicio inválida');
   if(!Number.isFinite(Date.parse(e.checkedAt)))errors.push(where+': falta la fecha de comprobación');
   if(!e.checkedBy)errors.push(where+': falta quién lo comprobó');
  }
 }
 return errors;
}

export async function prepare(){
 const base=await read('insumos.json'),details=(await optional('insumos-detalles.json'))||{},manual=(await optional('insumos-manuales.json'))||{products:[]};
 const errors=validateManual(manual);if(errors.length)throw Error(errors.join('\n'));
 const products=base.products.map(p=>({...p,evidence:[...p.evidence]}));
 const byKey=new Map(products.map(p=>[key(p.name,p.manufacturer),p]));
 for(const m of manual.products){
  const evidence=m.evidence.map(e=>({...e,present:true}));
  const existing=byKey.get(key(m.name,m.manufacturer));
  if(existing)existing.evidence.push(...evidence);
  else{const p={id:'manual-'+foldInput(m.manufacturer+' '+m.name).replace(/ /g,'-'),name:m.name,manufacturer:m.manufacturer,type:m.type,family:m.family||'Abonos y otros fertilizantes',...(m.country?{country:m.country}:{}),evidence};products.push(p);byKey.set(key(p.name,p.manufacturer),p);}
 }
 for(const p of products){const d=details[p.name];if(d&&foldInput(d.manufacturer)===foldInput(p.manufacturer))p.details=d;}
 const shards=Array.from({length:SHARDS},()=>[]);
 const list=products.map(p=>{const s=shardOf(p.id);shards[s].push(p);return {id:p.id,s,name:p.name,manufacturer:p.manufacturer,type:p.type,family:p.family,...(p.country?{country:p.country}:{}),...(p.manufacturerRole?{manufacturerRole:p.manufacturerRole}:{}),evidence:p.evidence.map(e=>({issuer:e.issuer,checkedAt:e.checkedAt,present:e.present,validFrom:e.validFrom??null,validUntil:e.validUntil??null,...(e.verification?{verification:e.verification}:{})}))};});
 const manualCount=manual.products.length;
 await mkdir(OUT,{recursive:true});
 await writeFile(new URL('insumos-lista.json',OUT),JSON.stringify({version:base.version,checkedAt:base.checkedAt,coverage:base.coverage,rules:base.rules,sources:base.sources,manualCount,shards:SHARDS,products:list}));
 for(let i=0;i<SHARDS;i++)await writeFile(new URL('insumos-fichas-'+String(i).padStart(2,'0')+'.json',OUT),JSON.stringify(shards[i]));
 return {products:list.length,manualCount};
}

if(import.meta.url===`file://${process.argv[1]}`){const r=await prepare();console.log('Insumos preparados: '+r.products+' fichas ('+r.manualCount+' certificados a mano) en '+SHARDS+' partes.');}
