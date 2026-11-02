import {createHash,randomUUID} from 'node:crypto';
import {foldInput,inputFamily} from './inputs-core.mjs';

export const KIWA_DIRECTORY='https://www.kiwa.com/cr/es-cr/tipo-de-servicio/certificacion/evaluacion-insumos/';
const PROPERTIES=['Marca Comercial','Uso','Vigencia','Nombre de la empresa','Dirección','(UE) nº 2021/1165','Evaluado por'];

async function request(url,resourceKey,body){
 const u=new URL(url);
 if(u.protocol!=='https:'||(!/^wabi-[a-z0-9-]+-api\.analysis\.windows\.net$/.test(u.hostname)&&u.hostname!=='app.powerbi.com'&&u.hostname!=='www.kiwa.com'))throw Error('Destino Kiwa no permitido');
 const headers={Accept:'application/json'};
 if(resourceKey){headers['X-PowerBI-ResourceKey']=resourceKey;headers.ActivityId=randomUUID();headers.RequestId=randomUUID();}
 if(body)headers['Content-Type']='application/json';
 const response=await fetch(url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000),redirect:'error'});
 if(!response.ok)throw Error(`Directorio Kiwa: HTTP ${response.status}`);
 const text=await response.text();if(text.length>30_000_000)throw Error('Respuesta Kiwa demasiado grande');
 return body||resourceKey?JSON.parse(text):text;
}

export function decodeKiwa(data){
 const dataset=data?.dsr?.DS;
 if(!Array.isArray(dataset)||dataset.length!==1)throw Error('Respuesta Kiwa sin tabla única');
 const ds=dataset[0],blocks=ds.PH;
 if(!Array.isArray(blocks)||blocks.length!==1||!Array.isArray(blocks[0].DM0))throw Error('Respuesta Kiwa sin filas');
 if(ds.RT||data.dsr.RT)throw Error('Directorio Kiwa truncado; falta continuar la paginación');
 const encoded=blocks[0].DM0,shape=encoded[0]?.S;
 if(!Array.isArray(shape)||shape.length!==PROPERTIES.length||encoded.length>=10000)throw Error('Cobertura Kiwa incompleta o esquema cambiado');
 const names=data.descriptor?.Select?.map(s=>s.Name);
 if(JSON.stringify(names)!==JSON.stringify(PROPERTIES.map(p=>'Insumos.'+p)))throw Error('Cambió el orden de las columnas Kiwa');
 let previous=[];const result=[];
 for(const row of encoded){
  const repeat=row.R||0,nulls=row['Ø']||0,maximum=(1<<shape.length)-1;
  if(!Number.isInteger(repeat)||repeat<0||repeat>maximum||!Number.isInteger(nulls)||nulls<0||nulls>maximum||(repeat&nulls))throw Error('Máscaras comprimidas Kiwa inválidas');
  if(row.S&&JSON.stringify(row.S)!==JSON.stringify(shape))throw Error('Cambió el esquema comprimido Kiwa');
  let cursor=0;const cells=shape.map((_,i)=>(row.R||0)&(1<<i)?previous[i]:(row['Ø']||0)&(1<<i)?null:row.C?.[cursor++]);
  if(cursor!==(row.C?.length||0)||cells.some(v=>v===undefined))throw Error('Fila comprimida Kiwa inválida');
  previous=cells;
  result.push(cells.map((value,i)=>{
   if(shape[i].DN&&typeof value==='number'){
    const text=ds.ValueDicts?.[shape[i].DN]?.[value];if(typeof text!=='string')throw Error('Diccionario Kiwa inválido');return text;
   }return value;
  }));
 }
 return result;
}

export function parseKiwa(values,checkedAt){
 if(!Array.isArray(values))throw Error('Listado Kiwa inválido');
 const rows=new Map();let excludedCount=0;
 for(const [name,type,expiry,manufacturer,address,eu,evaluator] of values){
  const usage=foldInput(type||''),standard=String(eu||'').trim();
  const nutrition=/fertilizante|bioestimulante|mejorador.*suelo|acondicionador.*suelo|enmienda|promotor de crecimiento vegetal|inoculante microbiano para suelo|corrector|micronutriente|algas|aminoacido|nutriente/.test(usage);
  // Read approvals exclusively from Kiwa's EU column. NOP/JAS approvals and
  // EU Annex VI restricted to third countries never qualify for mainland EU.
  const approved=!!standard&&!/^n\/?a$/i.test(standard)&&!/^(?:Anexo|Aneo) VI\b/i.test(standard);
  const protection=!/^coad|^coay/.test(usage)&&/control de plagas|control de enfermedades|pesticida|fungicida|insecticida|nematicida|herbicida|acaricida|feromona|repelente/.test(usage);
  const outsideCrops=/limpieza|desinfe|limpiador|animal|ganado|alimentacion|semilla|funda|cera protectante|protectante en postcosecha/.test(usage);
  if(!approved||protection||outsideCrops){excludedCount++;continue;}
  if(!/^(?:Anexo|Aneo|Articulo|\((?:UE|EU)\)|2021\/1165)/i.test(standard))throw Error('Referencia UE Kiwa desconocida; revisar en vez de omitir');
  if(typeof name!=='string'||!name.trim()||typeof manufacturer!=='string'||!manufacturer.trim()||typeof type!=='string')throw Error('Producto Kiwa sin identidad completa');
  if(expiry!==null&&(!Number.isFinite(expiry)||expiry<0))throw Error('Fecha de vigencia Kiwa inválida');
  const validUntil=expiry===null?null:new Date(expiry).toISOString().slice(0,10);
  const id=createHash('sha256').update(foldInput(manufacturer)+'|'+foldInput(name)+'|'+foldInput(type)).digest('hex').slice(0,24);
  const evidence={issuer:'Kiwa BCS',scheme:'Evaluación de insumos: Unión Europea (2021/1165)',sourceUrl:KIWA_DIRECTORY,checkedAt,validFrom:null,validUntil,certificateNumber:null,present:true,conditions:[`Referencia UE publicada: ${standard}`,address?`Dirección del fabricante publicada: ${address}`:'',evaluator?`Evaluado por: ${evaluator}`:'','El directorio es mundial. No acredita por sí solo la comercialización ni el registro del producto en España.'].filter(Boolean).join('\n'),scope:'Insumos agrícolas: conformidad ecológica UE; comercialización en España no comprobada'};
  const product={id,name:name.trim(),manufacturer:manufacturer.trim(),type:type.trim(),family:nutrition?inputFamily(type):'Otros insumos agrícolas',country:/\bespaña\b/i.test(address||'')?'España (domicilio del fabricante)':'Directorio mundial; país de comercialización no publicado',evidence:[evidence]};
  const previous=rows.get(id);
  if(previous){if(!previous.evidence.some(e=>e.validUntil===validUntil&&e.conditions===evidence.conditions))previous.evidence.push(evidence);}
  else rows.set(id,product);
 }
 const result=[...rows.values()];Object.defineProperties(result,{totalCount:{value:values.length},excludedCount:{value:excludedCount}});return result;
}

export async function collectKiwa(checkedAt){
 if(!checkedAt||!Number.isFinite(Date.parse(checkedAt)))throw Error('Fecha de consulta Kiwa inválida');
 const html=await request(KIWA_DIRECTORY);
 const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
 const published=links.map(link=>{try{const u=new URL(link,KIWA_DIRECTORY);return u.hostname.endsWith('.safelinks.protection.outlook.com')?new URL(u.searchParams.get('url')):u;}catch{return null;}}).find(u=>u?.hostname==='app.powerbi.com'&&u.pathname==='/view'&&u.searchParams.get('r'));
 if(!published)throw Error('Kiwa no publica enlace a su directorio Power BI');
 let descriptor;try{descriptor=JSON.parse(Buffer.from(published.searchParams.get('r'),'base64').toString('utf8'));}catch{throw Error('Enlace público Kiwa inválido');}
 if(!/^[0-9a-f-]{36}$/.test(descriptor.k))throw Error('Identificador de informe Kiwa inválido');
 const page=await request(published.href),cluster=page.match(/var resolvedClusterUri = '([^']+)'/)?.[1];
 if(!cluster)throw Error('No se puede resolver el directorio Kiwa');
 const api=new URL(cluster);api.hostname=api.hostname.replace('-redirect.','-api.');
 const base=api.origin,reportPath='/public/reports/'+descriptor.k;
 const model=await request(base+reportPath+'/modelsAndExploration?preferReadOnlySession=true',descriptor.k);
 const schema=await request(base+reportPath+'/conceptualschema',descriptor.k);
 const modelId=model.models?.[0]?.id;
 const entity=schema.schemas?.find(s=>s.modelId===modelId)?.schema?.Entities?.find(e=>e.Name==='Insumos');
 if(!Number.isInteger(modelId)||!entity||PROPERTIES.some(p=>!entity.Properties.some(v=>v.Name===p)))throw Error('Cambió el esquema del directorio Kiwa');
 const query={Version:2,From:[{Name:'i',Entity:'Insumos',Type:0}],Select:PROPERTIES.map(Property=>({Column:{Expression:{SourceRef:{Source:'i'}},Property},Name:'Insumos.'+Property}))};
 const command={Query:query,Binding:{Primary:{Groupings:[{Projections:PROPERTIES.map((_,i)=>i)}]},DataReduction:{DataVolume:4,Primary:{Window:{Count:10000}}},Version:1}};
 const payload=await request(base+'/public/reports/querydata?synchronous=true',descriptor.k,{version:'1.0.0',queries:[{Query:{Commands:[{SemanticQueryDataShapeCommand:command}]},CacheKey:'',QueryId:'0'}],cancelQueries:[],modelId});
 if(payload.results?.length!==1||!payload.results[0].result?.data)throw Error('Consulta pública Kiwa fallida');
 const values=decodeKiwa(payload.results[0].result.data);
 if(values.length<100)throw Error('Caída inesperada de cobertura Kiwa');
 const result=parseKiwa(values,checkedAt);
 if(result.length<30)throw Error('Cobertura Kiwa UE de nutrición y suelo inesperada');
 const verification=await request(base+reportPath+'/modelsAndExploration?preferReadOnlySession=true',descriptor.k);
 if(verification.models?.[0]?.LastRefreshTime!==model.models[0].LastRefreshTime)throw Error('Kiwa se actualizó durante la consulta; repetir');
 return result;
}
