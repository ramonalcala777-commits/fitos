import {collectEcocert,ECOCERT_DIRECTORY} from './ecocert-directory.mjs';
import {collectCeres,CERES_DIRECTORY} from './ceres-directory.mjs';
import {collectKiwa,KIWA_DIRECTORY} from './kiwa-directory.mjs';
import {collectControlUnion,CONTROLUNION_DIRECTORY} from './controlunion-directory.mjs';
import {collectAgrocolor,AGROCOLOR_DIRECTORY} from './agrocolor-directory.mjs';
import {collectSohiscert,collectCertis} from './sohiscert-directory.mjs';
import {collectFibl} from './fibl-directory.mjs';
import {collectIntereco} from './intereco-directory.mjs';
import {createHash} from 'node:crypto';
import {downloadPublic} from './public-download.mjs';
import {foldInput,inputFamily} from './inputs-core.mjs';
const CAAE='https://insumosapp.caae.es/';
const INTERECO='https://interecoweb.com/empresa/de-sangosse-iberica-s-l/';
const schemes=new Set(['Insumos UNE 142500: Fertilizantes para la prod agricultura ecológica UE','Insumos para la prod ecológica agricultura UE']);
const key=(name,manufacturer,type)=>createHash('sha256').update(foldInput(manufacturer)+'|'+foldInput(name)+'|'+foldInput(type)).digest('hex').slice(0,24);
export function parseCaae(rows,checkedAt){
 if(!Array.isArray(rows)||rows.length<100)throw Error('Listado CAAE incompleto');
 return rows.filter(r=>schemes.has(r.Servicio)&&['Fertilizantes','Fertilizantes UE'].includes(r.Producto)).map(r=>{
  const name=String(r['Marca Comercial']||'').trim(),manufacturer=String(r.NombreOperador||'').trim(),type=String(r['Categoría']||'').trim();
  if(!name||!manufacturer||!type)throw Error('Fila CAAE sin identificación');
  return {id:key(name,manufacturer,type),name,manufacturer,type,family:inputFamily(type),country:r['País']||'No publicado',evidence:[{issuer:'CAAE',scheme:r.Servicio,sourceUrl:CAAE,checkedAt,validFrom:null,validUntil:null,certificateNumber:null,present:true,conditions:r.Observaciones||'',scope:'Agricultura ecológica de la UE'}]};
 });
}
export function parseCigo(html,checkedAt){
 const block=html.split(/<div class="jet-listing-grid__item\b/).find(s=>/jet-listing-dynamic-field__content[^>]*>CIGO-B COMPLEX<\/div>/.test(s));
 if(!block)throw Error('Cigo-B Complex no localizado; revisar el directorio INTERECO');
 const matches=[...block.matchAll(/jet-listing-dynamic-field__content[^>]*>([^<]+)<\/div>/g)].map(x=>x[1].trim());
 const dates=matches.filter(v=>/^\d{2}\/\d{2}\/\d{4}$/.test(v));
 if(dates.length!==1||!block.includes('DE SANGOSSE IBÉRICA, S.L.'))throw Error('Ficha INTERECO de Cigo ambigua');
 const [d,m,y]=dates[0].split('/');const validUntil=`${y}-${m}-${d}`;
 if(new Date(validUntil+'T12:00:00Z').toISOString().slice(0,10)!==validUntil)throw Error('Fecha INTERECO inválida');
 return {id:key('CIGO-B COMPLEX','DE SANGOSSE IBÉRICA, S.L.','Oligoelementos'),name:'CIGO-B COMPLEX',manufacturer:'DE SANGOSSE IBÉRICA, S.L.',type:'Oligoelementos',family:'Correctores y micronutrientes',evidence:[{issuer:'INTERECO',scheme:'Directorio de insumos certificados',sourceUrl:INTERECO,checkedAt,validFrom:null,validUntil,certificateNumber:null,present:true,conditions:'Aplicar los micronutrientes para corregir necesidades justificadas y conforme a la etiqueta del producto.',scope:'Producción ecológica'}]};
}
export async function refreshInputs(previous={products:[],sources:[]},{collectors={}}={}){
 const checkedAt=new Date().toISOString(),products=new Map(),sources=[];
 for(const issuer of ['CAAE','INTERECO','SOHISCERT','SOHISCERT · Certis Belchim','FiBL','ECOCERT','CERES','Kiwa BCS','Control Union','Agrocolor']){
  try{
   let rows;
   if(collectors[issuer])rows=await collectors[issuer](checkedAt);
   else if(issuer==='CAAE'){
    const html=(await downloadPublic(CAAE)).toString('utf8');const path=html.match(/<script src="(main\.[a-z0-9]+\.js)"/i)?.[1];if(!path)throw Error('No se localizó el directorio CAAE');
    const js=(await downloadPublic(new URL(path,CAAE).href)).toString('utf8');
    // Public directory credentials are extracted transiently from its own client; never logged or persisted.
    const authorization=js.match(/Authorization:"([^"]+)"/)?.[1];
    const endpoint=js.match(/https:\/\/[^"\s]+\.amazonaws\.com\/caae\/portalInsumos"/)?.[0].slice(0,-1);
    if(!authorization||!endpoint)throw Error('Cambio en el acceso público CAAE');
    const payload=JSON.parse((await downloadPublic(endpoint,{Authorization:authorization})).toString('utf8'));
    rows=parseCaae(payload.recordset,checkedAt);if(rows.length<100)throw Error('Cobertura CAAE inesperada');
   }else if(issuer==='SOHISCERT') rows=await collectSohiscert(checkedAt,downloadPublic);
   else if(issuer==='SOHISCERT · Certis Belchim') rows=await collectCertis(checkedAt,downloadPublic);
   else if(issuer==='FiBL') rows=await collectFibl(checkedAt);
   else if(issuer==='ECOCERT') rows=await collectEcocert(checkedAt);
   else if(issuer==='CERES') rows=await collectCeres(checkedAt,downloadPublic);
   else if(issuer==='Kiwa BCS') rows=await collectKiwa(checkedAt);
   else if(issuer==='Control Union') rows=await collectControlUnion(checkedAt);
   else if(issuer==='Agrocolor') rows=await collectAgrocolor(checkedAt);
   else rows=await collectIntereco(checkedAt,downloadPublic);
   rows=rows.map(r=>({...r,id:r.id||key(r.name,r.manufacturer,r.type),family:r.family||inputFamily(r.type)}));
   const previousCount=previous.products.filter(p=>p.evidence.some(e=>e.issuer===issuer&&e.present)).length;
   if(previousCount&&new Set(rows.map(r=>r.id)).size<previousCount*.7)throw Error('Descenso de cobertura superior al 30%; se requiere revisión');
   sources.push({issuer,url:sourceUrl(issuer),checkedAt,ok:true,count:rows.length,pendingCount:rows.filter(p=>p.evidence.some(e=>e.verification==='confirmation_unavailable')).length,coverage:coverage(issuer)});
   for(const row of rows){if(row.evidence.some(e=>e.verification==='confirmation_unavailable')){const prior=previous.products.find(p=>p.id===row.id);if(prior)row.evidence.push(...prior.evidence.filter(e=>e.issuer===issuer&&e.verification!=='confirmation_unavailable'));}}
   const found=new Set(rows.map(r=>r.id));
   // Retain withdrawn entries as history and stop presenting their old listing as current.
   for(const old of previous.products||[])if(!found.has(old.id)&&old.evidence.some(e=>e.issuer===issuer))rows.push({...old,evidence:old.evidence.filter(e=>e.issuer===issuer).map(e=>({...e,present:false,checkedAt}))});
   for(const row of rows){const old=products.get(row.id);products.set(row.id,old?{...old,evidence:[...old.evidence,...row.evidence]}:row);}
  }catch(error){sources.push({issuer,url:sourceUrl(issuer),checkedAt,ok:false,coverage:coverage(issuer),retainedCount:previous.products.filter(p=>p.evidence.some(e=>e.issuer===issuer)).length,error:error.message});for(const old of previous.products||[]){const evidence=old.evidence.filter(e=>e.issuer===issuer);if(evidence.length){const current=products.get(old.id);products.set(old.id,current?{...current,evidence:[...current.evidence,...evidence]}:{...old,evidence});}}}
 }
 const productsList=[...products.values()].map(p=>{const evidence=new Map();for(const e of p.evidence){const k=e.issuer+'|'+e.scheme+'|'+(e.validFrom||'')+'|'+(e.validUntil||'')+'|'+(e.certificateNumber||'')+'|'+e.sourceUrl,old=evidence.get(k);evidence.set(k,old?{...e,conditions:[...new Set([old.conditions,e.conditions].filter(Boolean))].join('\n')}:e);}return {...p,evidence:[...evidence.values()]};});
 if(!productsList.length)throw Error('No se pudo obtener ningún insumo certificado');
 return {version:1,checkedAt,sources,products:productsList.sort((a,b)=>a.name.localeCompare(b.name,'es')),coverage:'Fuentes conectadas con cobertura parcial. Consultar el alcance por fuente. La certificación ECO no es autorización por cultivo.',rules:'La etiqueta ECO requiere presencia en un directorio de certificación, fecha publicada sin vencer y consulta realizada en los últimos 30 días. Sin fecha de caducidad publicada se muestra explícitamente en directorio. La etiqueta no verifica comercialización en España, dosis, mezcla o aplicación concreta.'};
}

function sourceUrl(issuer){return ({CAAE,INTERECO:'https://interecoweb.com/buscador-de-insumos/',SOHISCERT:'https://sohiscert.com/insumos-para-agricultura-ecologica/','SOHISCERT · Certis Belchim':'https://certisbelchim.es/productos/cruzado-zn-mn-fe-idha/',FiBL:'https://www.input-list.com/spain/index.html',ECOCERT:ECOCERT_DIRECTORY,CERES:CERES_DIRECTORY,'Kiwa BCS':KIWA_DIRECTORY,'Control Union':CONTROLUNION_DIRECTORY,Agrocolor:AGROCOLOR_DIRECTORY})[issuer];}
function coverage(issuer){return ({CAAE:'Directorio completo de fertilizantes con esquemas ECO UE, incluidos operadores internacionales; país publicado no acredita comercialización en España.',INTERECO:'Directorio público completo de empresas y productos de nutrición y suelo.',SOHISCERT:'Fertilizantes del registro público UNE completo enlazado por SOHISCERT; no incluye todos sus pliegos privados.','SOHISCERT · Certis Belchim':'Todos los insumos de nutrición/suelo del certificado SOHISCERT publicado por Certis Belchim, incluido Cruzado.',FiBL:'Insumos de nutrición y suelo en la lista España y su estándar correspondiente.',ECOCERT:'Todas las categorías públicas de nutrición y suelo, todos los países, conformidad UE explícita; se distingue revisión documental de atestación.',CERES:'Directorio mundial de nutrición y suelo con conformidad UE explícita y confirmaciones publicadas.','Kiwa BCS':'Directorio mundial: nutrición y suelo con evaluación UE. Vigencia publicada; país de comercialización no verificado.','Control Union':'Programa EU Inputs: descarga del listado oficial y acceso a fichas individuales por comprobar.',Agrocolor:'Consulta de certificados y alcance de reconocimiento de insumos. Listado completo no publicado.'})[issuer];}
