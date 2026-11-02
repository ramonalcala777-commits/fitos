import {createHash} from 'node:crypto';
import {foldInput,inputFamily} from './inputs-core.mjs';

// inputs.bio redirects its public directory to this Ecocert-owned canonical host.
export const ECOCERT_DIRECTORY='https://ap.ecocert.com/intrants/index.php?liste=international&l=es';
const CATEGORIES=[34,12,24,54,53,9,10,41,7];
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',eacute:'é',Eacute:'É',aacute:'á',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',Ntilde:'Ñ',uuml:'ü',ouml:'ö',auml:'ä',deg:'°',reg:'®',trade:'™'};
function text(html){return html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/g,(full,key)=>key[0]==='#'?String.fromCodePoint(key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10)):(entities[key]??full)).trim();}
function url(category){
 const result=new URL(ECOCERT_DIRECTORY);result.searchParams.set('recherche_pays','0');result.searchParams.set('recherche_categorie',String(category));result.searchParams.set('recherche_statut_tous','0');result.searchParams.set('recherche_statut_ce','on');return result.href;
}
async function download(source){
 const target=new URL(source);if(target.origin!=='https://ap.ecocert.com'||target.pathname!=='/intrants/index.php')throw Error('Destino del directorio ECOCERT no permitido');
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error(`Directorio ECOCERT: HTTP ${response.status}`);
   const html=await response.text();if(html.length>50_000_000)throw Error('Directorio ECOCERT demasiado grande');return html;
  }catch(error){last=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
 }
 throw last;
}

export function parseEcocert(html,checkedAt,category){
 if(!CATEGORIES.includes(category)||typeof html!=='string')throw Error('Categoría ECOCERT no permitida');
 const formEnd=html.indexOf('</FORM>'),tableEnd=html.indexOf('</table>',formEnd);
 if(formEnd<0||tableEnd<formEnd||!html.includes('INFORMACION IMPORTANTE'))throw Error('Directorio ECOCERT incompleto');
 // The current public directory renders the complete result set in one HTML table.
 // Stop rather than silently import a partial result if pagination is introduced.
 if(/(?:href|action)\s*=\s*["'][^"']*[?&](?:page|offset|start|pageno|num_page)=/i.test(html)||/class\s*=\s*["'][^"']*pagination/i.test(html))throw Error('ECOCERT introdujo paginación; revisar extracción completa');
 for(const id of CATEGORIES)if(!new RegExp(`<option\\s+value=["']${id}["']`).test(html))throw Error('Cambió la clasificación ECOCERT');
 const rows=[];
 for(const match of html.slice(formEnd,tableEnd).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
  if(!cells.length)continue;
  const supplier=cells[1]?.match(/href=["']fournisseur\.php\?id=(\d+)["']/);
  if(!supplier){if(cells.some(c=>/fournisseur\.php/.test(c)))throw Error('Ficha ECOCERT sin titular verificable');continue;}
  if(cells.length!==7)throw Error('Cambió el formato de ficha ECOCERT');
  const [name,manufacturer,type,country,status,restriction,information]=cells.map(text);
  if(!name||!manufacturer||!type||!country)throw Error('Ficha ECOCERT incompleta');
  // EU evidence must be affirmative and explicit on each product, not merely the query.
  if(!/^Conforme(?: y controlado)? según el reglamento europeo UE 2018\/848(?:\s|$|,)/.test(status))throw Error('Ficha filtrada ECOCERT sin conformidad UE explícita');
  const audited=/^Conforme y controlado según/.test(status);
  const source=new URL(ECOCERT_DIRECTORY);source.searchParams.set('recherche_produit',name);source.searchParams.set('recherche_fournisseur',manufacturer);source.searchParams.set('recherche_categorie',String(category));source.searchParams.set('recherche_statut_tous','0');source.searchParams.set('recherche_statut_ce','on');
  const id=createHash('sha256').update(foldInput(manufacturer)+'|'+foldInput(name)+'|'+foldInput(type)).digest('hex').slice(0,24);
  const verification=audited?'Atestación de insumos: conforme y controlado':'Revisión documental: conforme; sin atestación de auditoría';
  rows.push({id,name,manufacturer,manufacturerRole:'manufacturer_or_distributor',type,family:inputFamily(type),country,commercialSpainVerified:false,evidence:[{
   issuer:'ECOCERT',scheme:verification,sourceUrl:source.href,checkedAt,validFrom:null,validUntil:null,certificateNumber:null,present:true,
   verification:audited?'attestation':'documentary_review',
   conditions:[verification,restriction,information,`País publicado para el fabricante/distribuidor: ${country}. La inclusión global no verifica comercialización ni aplicación en España. No se publica caducidad en este directorio.`].filter(Boolean).join('\n'),
   scope:'Conformidad explícita con el Reglamento europeo UE 2018/848; no inferida de NOP, JAS u otros esquemas',
  }]});
 }
 return rows;
}

export async function collectEcocert(checkedAt){
 if(!checkedAt||!Number.isFinite(Date.parse(checkedAt)))throw Error('Fecha de consulta ECOCERT inválida');
 const rows=[],categoryCounts={};
 // Two concurrent requests avoid overloading the public directory.
 for(let start=0;start<CATEGORIES.length;start+=2){
  const batch=await Promise.all(CATEGORIES.slice(start,start+2).map(async category=>({category,rows:parseEcocert(await download(url(category)),checkedAt,category)})));
  for(const entry of batch){categoryCounts[entry.category]=entry.rows.length;rows.push(...entry.rows);}
 }
 if(categoryCounts[34]<1000||rows.length<1000||rows.length>30000)throw Error('Cobertura ECOCERT inesperada; revisar directorio');
 const unique=new Map();
 for(const row of rows){
  const prior=unique.get(row.id);
  if(!prior){unique.set(row.id,row);continue;}
  const same=prior.evidence.find(e=>e.scheme===row.evidence[0].scheme);
  if(same)same.conditions=[...new Set([same.conditions,row.evidence[0].conditions])].join('\n');
  else prior.evidence.push(row.evidence[0]);
  if(prior.country!==row.country)throw Error('Países ECOCERT contradictorios para el mismo titular');
 }
 const result=[...unique.values()];
 result.sort((a,b)=>(a.country==='SPAIN'?0:1)-(b.country==='SPAIN'?0:1)||a.name.localeCompare(b.name,'es'));
 Object.defineProperties(result,{categoryCounts:{value:categoryCounts},spanishOperatorCount:{value:result.filter(r=>r.country==='SPAIN').length},rawCount:{value:rows.length}});
 return result;
}
