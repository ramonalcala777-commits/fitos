// Actualización semanal de Fitos (se ejecuta en GitHub Actions o en local).
//
// Sustituye al actualizador de ChatGPT, que enviaba los datos a un servidor.
// Aquí se leen y escriben directamente los archivos de public/data, con las
// mismas comprobaciones que hacía ese servidor antes de aceptar cada dato.
//
// Cada apartado (insumos, normativa ECO, MAPA, excepcionales) es independiente:
// si uno falla, se conserva su última versión válida y los demás siguen.
// El proceso termina con código 1 si algún apartado falló, para que GitHub
// lo marque en rojo y avise por correo.
import {readFile,writeFile,rename,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildSnapshot,ORIGIN,changesBetween,validateSnapshot} from '../lib/mapa.mjs';
import {enrichSnapshot} from '../lib/uses.mjs';
import {checkEcoLaw} from '../lib/check-eco-law.mjs';
import {refreshExceptionHistory} from '../lib/exceptions-update.mjs';
import {refreshInputs} from '../lib/inputs-update.mjs';

const DATA=new URL('../public/data/',import.meta.url);
const only=new Set((process.argv.slice(2).join(',')||'insumos,normativa,mapa,excepcionales').split(',').map(s=>s.trim()).filter(Boolean));
const read=async name=>JSON.parse(await readFile(new URL(name,DATA),'utf8'));
const readOptional=async name=>{try{return await read(name)}catch{return null}};
async function write(name,data){const tmp=new URL(name+'.tmp',DATA);await writeFile(tmp,JSON.stringify(data));await rename(tmp,new URL(name,DATA));}
const results=[];
// Novedades de esta ejecución para el aviso por correo (solo lo relevante para Ramón).
const news={mapa:[],excepcionales:[],normativa:null};
const NOTEWORTHY=new Set(['Cancelado','Fecha límite de venta','Ya no aparece en la consulta','Alta en consulta','Cambio en usos autorizados','Vuelve a estar vigente','Cambio de situación']);
// Historial de cambios del registro (últimos 6 meses, máximo 80 entradas).
async function addHistory(crop,next){
 const history=(await readOptional('cambios-historial.json'))||{entries:[]};
 history.entries.unshift({date:next.checkedAt,crop,sourceDate:next.sourceDate,changes:next.changes});
 const limit=Date.now()-183*86400000;history.entries=history.entries.filter(e=>Date.parse(e.date)>=limit).slice(0,80);
 await write('cambios-historial.json',history);
}
async function stage(name,fn){
 if(!only.has(name))return;
 const startedAt=new Date().toISOString();let last;
 for(let attempt=1;attempt<=2;attempt++){
  try{const detail=await fn();results.push({stage:name,ok:true,startedAt,finishedAt:new Date().toISOString(),...detail});console.log(JSON.stringify({stage:name,ok:true,...detail}));return;}
  catch(e){last=e;console.error('['+name+'] intento '+attempt+': '+(e?.stack||e));if(attempt<2)await new Promise(r=>setTimeout(r,30000));}
 }
 results.push({stage:name,ok:false,startedAt,finishedAt:new Date().toISOString(),error:String(last?.message||last)});
}

// ---------- Insumos ECO (antes POST /api/inputs) ----------
const INPUT_ISSUERS=['CAAE','INTERECO','SOHISCERT','SOHISCERT · Certis Belchim','FiBL','ECOCERT','CERES','Kiwa BCS','Control Union','Agrocolor'];
const INPUT_HOSTS=['insumosapp.caae.es','interecoweb.com','sohiscert.com','certisbelchim.es','www.input-list.com','ap.ecocert.com','infoxgen2.marmara.work','www.ceres-cert.de','www.kiwa.com','cucpublications.controlunion.com','www.agrocolor.es'];
function validateInputs(data){
 if(data.version!==1||!/^20\d\d-/.test(data.checkedAt)||!Array.isArray(data.sources)||!Array.isArray(data.products)||!data.products.length||data.products.length>20000)throw Error('Catálogo inválido');
 const ids=new Set();
 for(const p of data.products){
  if(typeof p.id!=='string'||ids.has(p.id)||!p.name||!p.manufacturer||!Array.isArray(p.evidence)||!p.evidence.length)throw Error('Identificación de insumo inválida');ids.add(p.id);
  for(const e of p.evidence){
   if(!INPUT_ISSUERS.includes(e.issuer)||!e.scheme||!e.sourceUrl||!Number.isFinite(Date.parse(e.checkedAt))||typeof e.present!=='boolean'||(e.validUntil&&!/^\d{4}-\d{2}-\d{2}$/.test(e.validUntil)))throw Error('Evidencia inválida');
   const u=new URL(e.sourceUrl);if(u.protocol!=='https:'||!INPUT_HOSTS.includes(u.hostname))throw Error('Fuente no permitida');
  }
 }
}
await stage('insumos',async()=>{
 const previous=await read('insumos.json');
 const next=await refreshInputs(previous);
 validateInputs(next);
 await write('insumos.json',next);
 return {count:next.products.length,checkedAt:next.checkedAt,sources:next.sources.map(s=>({issuer:s.issuer,ok:s.ok,count:s.count,error:s.error}))};
});

// ---------- Normativa ECO (antes POST /api/ecology) ----------
await stage('normativa',async()=>{
 const next=await checkEcoLaw();
 if(!['unchanged','unavailable','review-required'].includes(next.status)||typeof next.message!=='string'||!/^20\d\d-/.test(next.checkedAt)||!Array.isArray(next.laws))throw Error('Estado normativo inválido');
 const previous=await readOptional('normativa-eco.json');
 if(previous?.requiresReview)next.requiresReview=true; // solo una revisión humana lo levanta
 if(next.status==='review-required'||(next.requiresReview&&!previous?.requiresReview))news.normativa=next.laws.filter(l=>l.status==='changed').map(l=>l.law+': nueva versión vigente '+l.currentVersion+' (revisada: '+l.version+')');
 await write('normativa-eco.json',next);
 return {status:next.status,verified:next.verified,requiresReview:next.requiresReview,laws:next.laws.map(l=>({law:l.law,status:l.status,error:l.error}))};
});

// ---------- Registro MAPA: pistacho, almendro y frutos de cáscara (antes POST /api/import) ----------
await stage('mapa',async()=>{
 const complete=await fetch(ORIGIN+'/Exportaciones/ExportJsonProductosAutorizados',{method:'POST',body:new URLSearchParams({tipoExportacion:'ProductosAutorizados',dataDto:'{}'}),signal:AbortSignal.timeout(180000)});
 if(!complete.ok)throw Error('Descarga de usos: MAPA '+complete.status);
 const raw=await complete.text();let wrapper=JSON.parse(raw);if(typeof wrapper==='string')wrapper=JSON.parse(wrapper);const official=JSON.parse(wrapper.Contenido);
 const sourceDate=new Date(wrapper.Fecha).toISOString();const digest=createHash('sha256').update(raw).digest('hex');
 const crops={},failures=[];
 for(const crop of ['pistacho','almendro','cascara']){
  const attemptedAt=new Date().toISOString();
  try{
   const previous=await read(crop+'.json');
   const next=enrichSnapshot(await buildSnapshot(crop,previous),official,sourceDate,digest);
   if(!next.usesIncluded||!/^20\d{2}-/.test(next.sourceDate)||!/^\w{64}$/.test(next.sourceDigest)||!next.products.every(p=>Number.isInteger(p.IdProducto)&&typeof p.Nombre==='string'&&typeof p.NumRegistro==='string'&&typeof p.Estado==='string'&&typeof p.direct==='boolean'&&Array.isArray(p.categories)&&Array.isArray(p.uses)))throw Error('Formato de datos no válido');
   if(previous.sourceDate&&next.sourceDate<previous.sourceDate)throw Error('La fuente es anterior a la versión publicada');
   validateSnapshot(previous,next.products);
   next.products.sort((a,b)=>a.IdProducto-b.IdProducto);
   next.changes=changesBetween(previous,next.products);next.checkedAt=new Date().toISOString();
   await write(crop+'.json',next);
   if(next.changes.length)await addHistory(crop,next);
   for(const c of next.changes)if(NOTEWORTHY.has(c.type)&&!(c.type==='Alta en consulta'&&!/^Vigente/.test(c.detail||'')))news.mapa.push({crop,...c});
   const status={ok:true,attemptedAt:next.checkedAt,sourceDate:next.sourceDate,count:next.products.length,changes:next.changes.length};
   await write('estado-'+crop+'.json',status);crops[crop]=status;
  }catch(e){
   const status={ok:false,attemptedAt,error:'Consulta de '+crop+' en MAPA no completada: '+(e?.message||e)};
   await write('estado-'+crop+'.json',status);crops[crop]=status;failures.push(crop);
  }
 }
 if(failures.length)throw Error('Fallaron: '+failures.join(', ')+' · '+failures.map(c=>crops[c].error).join(' | '));
 return {sourceDate,crops};
});

// ---------- Autorizaciones excepcionales (antes POST /api/exceptions) ----------
const EXCEPTION_HOSTS=['ec.europa.eu','webgate.ec.europa.eu','www.mapa.gob.es','servicio.mapa.gob.es'];
await stage('excepcionales',async()=>{
 const previous=await read('excepcionales.json');
 const next=await refreshExceptionHistory(previous);
 if(!Array.isArray(next.records)||!next.records.length||typeof next.coverage!=='string'||!Array.isArray(next.sources)||!/^20\d\d-/.test(next.checkedAt)||!next.records.every(r=>typeof r.id==='string'&&typeof r.title==='string'&&Array.isArray(r.crops)&&r.crops.every(c=>['almendro','pistacho'].includes(c))&&Array.isArray(r.periods)&&r.periods.every(p=>/^20\d\d-\d\d-\d\d$/.test(p.from)&&/^20\d\d-\d\d-\d\d$/.test(p.to)&&p.from<=p.to)&&EXCEPTION_HOSTS.includes(new URL(r.sourceUrl).hostname)))throw Error('Historial inválido');
 // Nunca se pierde un registro anterior: se conservan como historial.
 const records=new Map(previous.records.map(r=>[r.id,r]));for(const r of next.records)records.set(r.id,r);next.records=[...records.values()];
 const known=new Set(previous.records.map(r=>r.id));for(const r of next.records)if(!known.has(r.id))news.excepcionales.push({id:r.id,title:r.title,crops:r.crops,pending:!r.periods.length||!!r.raw?.requiresReview,periods:r.periods});
 await write('excepcionales.json',next);
 return {count:next.records.length,checkedAt:next.checkedAt,requiresReview:next.records.filter(r=>r.raw?.requiresReview).map(r=>r.id)};
});

// ---------- Novedades (aviso por correo) ----------
const cropName=c=>({pistacho:'Pistacho',almendro:'Almendro',cascara:'Frutos de cáscara'})[c]||c;
const fmt=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const lines=[];
if(news.excepcionales.length){lines.push('### Autorizaciones excepcionales nuevas o modificadas','');for(const r of news.excepcionales)lines.push('- **'+r.title+'** ('+r.crops.map(cropName).join(', ')+')'+(r.pending?' — pendiente de revisión: comprobar cultivos, comunidades y fechas en el documento.':' — '+r.periods.map(p=>fmt(p.from)+' → '+fmt(p.to)+(p.territory?' ('+p.territory+')':'')).join('; ')));lines.push('');}
if(news.mapa.length){const seen=new Map();for(const c of news.mapa){const k=c.type+'|'+c.registration;const prev=seen.get(k);if(prev)prev.crops.add(c.crop);else seen.set(k,{...c,crops:new Set([c.crop])});}
 lines.push('### Cambios en el registro del MAPA','');for(const c of seen.values())lines.push('- **'+c.type+'**: '+c.name+' (n.º '+c.registration+') — '+[...c.crops].map(cropName).join(', ')+(c.detail?'. '+c.detail:''));lines.push('');}
if(news.normativa?.length){lines.push('### Normativa ECO','','Ha salido una versión nueva de la normativa ecológica. Las etiquetas ECO quedan suspendidas hasta revisar las reglas:',...news.normativa.map(x=>'- '+x),'');}
const failed=results.filter(r=>!r.ok);
if(failed.length){lines.push('### Apartados que no se pudieron actualizar','','La web conserva sus últimos datos válidos.',...failed.map(r=>'- '+r.stage+': '+String(r.error).slice(0,300)),'');}
await write('novedades.json',{generatedAt:new Date().toISOString(),hasNews:lines.length>0,markdown:lines.join('\n')});
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'novedades='+(lines.length?'si':'no')+'\n');

// ---------- Resumen ----------
const summary={finishedAt:new Date().toISOString(),ok:results.every(r=>r.ok),results};
const old=await readOptional('ultima-actualizacion.json');
const merged={...summary,results:[...(old?.results||[]).filter(r=>!results.some(n=>n.stage===r.stage)),...results]};
await write('ultima-actualizacion.json',merged);
if(process.env.GITHUB_STEP_SUMMARY){
 const lines=['## Actualización de Fitos','','| Apartado | Resultado | Detalle |','|---|---|---|',...results.map(r=>'| '+r.stage+' | '+(r.ok?'✅ correcto':'❌ fallo')+' | '+(r.ok?(r.count!=null?r.count+' fichas':r.status||Object.entries(r.crops||{}).map(([c,s])=>c+' '+s.count).join(', ')):r.error).toString().replace(/\|/g,'/').slice(0,400)+' |')];
 await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
}
console.log(JSON.stringify(summary,null,1).slice(0,4000));
if(!summary.ok)process.exitCode=1;
