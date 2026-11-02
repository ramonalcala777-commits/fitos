import {createHash} from 'node:crypto';
import {foldInput,inputFamily} from './inputs-core.mjs';

export const FIBL_DIRECTORY='https://www.input-list.com/spain/index.html';
export const FIBL_LIST='d23c9774-1c42-415b-8995-b9c8e06e4e8b';
export const FIBL_STANDARD='c0d035a5-f419-42dd-ba19-374158b33203';
const FERTILISERS='310943d2-03f5-446a-95e1-2362ddaf037d';
const PLANT_PROTECTION='f1fbcd0a-a090-4542-8f12-573e0e5770d7';
const ENDPOINTS=new Set([
 'https://api.fibl-services.org/bml/bml/pub/search',
 'https://api.fibl-services.org/bml/bml/pub/count',
 'https://api.fibl-services.org/bml/search/search/ids',
]);
const configuration={list:FIBL_LIST,locale:'es_ES',fallbackLocale:'en_GB',isEuMode:false,mandatoryStandards:[FIBL_STANDARD]};
const localised=value=>typeof value==='string'?value:(value?.es_ES||value?.en_GB||value?.de_DE||'');
const date=value=>{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Fecha publicada FiBL inválida');
 return value;
};
async function request(endpoint,body){
 if(!ENDPOINTS.has(endpoint)||new URL(endpoint).protocol!=='https:')throw Error('Destino FiBL no permitido');
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});
   if(!response.ok)throw Error(`Directorio FiBL: HTTP ${response.status}`);
   const text=await response.text();if(text.length>40_000_000)throw Error('Respuesta FiBL demasiado grande');
   const payload=JSON.parse(text);if(payload.ok!==true)throw Error('Respuesta FiBL inválida: '+String(payload.message||'sin datos'));
   return payload.data;
  }catch(error){last=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
 }
 throw last;
}

export function parseFibl(entities,checkedAt){
 if(!Array.isArray(entities))throw Error('Listado FiBL inválido');
 const rows=[];let excludedCount=0;
 for(const entity of entities){
  const data=entity.data?.listData?.[FIBL_LIST],index=entity.data?.indexData?.[FIBL_LIST];
  if(!data||!index)throw Error('Producto FiBL sin datos de la lista española');
  if(!Array.isArray(data._categoryTree))throw Error('Producto FiBL sin árbol de categoría');
  if(data._categoryTree.includes(PLANT_PROTECTION)){excludedCount++;continue;}
  if(!data._categoryTree.includes(FERTILISERS))throw Error('Categoría FiBL desconocida; revisar cobertura');
  const approval=data._approval?.[FIBL_STANDARD];
  if(!approval||typeof approval.active?.booleanValue!=='boolean'||typeof data._active!=='boolean')throw Error('Producto FiBL sin aprobación española verificable');
  const name=localised(index.name)||localised(data['basis-f1']);
  const manufacturer=index.manufacturer?.label||index.distributor?.label;
  const manufacturerRole=index.manufacturer?.label?'manufacturer':'distributor';
  const type=localised(index.category?.label);
  if(!name||!manufacturer||!type||!entity.id)throw Error('Producto FiBL sin identificación completa');
  const id=createHash('sha256').update(foldInput(manufacturer)+'|'+foldInput(name)+'|'+foldInput(type)).digest('hex').slice(0,24);
  rows.push({id,name,manufacturer,manufacturerRole,type,family:inputFamily(type),country:'España (lista FiBL)',evidence:[{
   issuer:'FiBL',scheme:'Lista de insumos para España',sourceUrl:`${FIBL_DIRECTORY}#/result/${entity.id}/${FIBL_LIST}/es_ES`,checkedAt,
   validFrom:date(approval.begin?.dateValue),validUntil:date(approval.end?.dateValue),certificateNumber:null,
   present:data._active&&approval.active.booleanValue,
   conditions:[localised(approval.restriction),manufacturerRole==='distributor'?'El operador publicado es el distribuidor; la fuente no identifica al fabricante.':''].filter(Boolean).join('\n'),
   scope:'Lista nacional de España: conformidad para agricultura ecológica de la UE',
  }]});
 }
 return {rows,excludedCount};
}

export async function collectFibl(checkedAt){
 if(!checkedAt||!Number.isFinite(Date.parse(checkedAt)))throw Error('Fecha de consulta FiBL inválida');
 // Verify category semantics against FiBL itself before classifying any product.
 const metadata=await request('https://api.fibl-services.org/bml/search/search/ids',{ids:[FERTILISERS,PLANT_PROTECTION,FIBL_STANDARD]});
 if(!Array.isArray(metadata)||metadata.find(r=>r.id===FERTILISERS)?.data?.mainCategoryKey!=='fertilisers'||metadata.find(r=>r.id===PLANT_PROTECTION)?.data?.mainCategoryKey!=='plant-protection-agents'||metadata.find(r=>r.id===FIBL_STANDARD)?.data?.homeList!==FIBL_LIST)throw Error('Cambió el esquema de la lista española FiBL');
 const totalCount=await request('https://api.fibl-services.org/bml/bml/pub/count',{searchConfiguration:configuration});
 if(!Number.isInteger(totalCount)||totalCount<100||totalCount>20000)throw Error('Cobertura FiBL inesperada');
 const entities=[],seen=new Set();
 for(let start=0;start<totalCount;start+=100){
  const page=await request('https://api.fibl-services.org/bml/bml/pub/search',{pagination:{start,limit:100},sorting:[`data.indexData.${FIBL_LIST}.name.es_ES:asc`],searchConfiguration:configuration});
  if(!Array.isArray(page)||page.length!==Math.min(100,totalCount-start))throw Error('Paginación FiBL incompleta');
  for(const entity of page){if(!entity.id||seen.has(entity.id))throw Error('Paginación FiBL duplicada');seen.add(entity.id);entities.push(entity);}
 }
 const endCount=await request('https://api.fibl-services.org/bml/bml/pub/count',{searchConfiguration:configuration});
 if(endCount!==totalCount||entities.length!==totalCount)throw Error('FiBL cambió durante la consulta; repetir actualización');
 const result=parseFibl(entities,checkedAt);
 if(result.rows.length<50)throw Error('Cobertura FiBL de nutrición y suelo inesperada');
 Object.defineProperties(result.rows,{totalCount:{value:totalCount},excludedCount:{value:result.excludedCount}});
 return result.rows;
}
