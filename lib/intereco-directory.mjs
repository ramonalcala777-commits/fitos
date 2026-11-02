// INTERECO exposes the complete published product and company indexes through
// WordPress REST. Company archive pages supply the published expiry dates.
const BASE='https://interecoweb.com/';
const REST=BASE+'wp-json/wp/v2/';
const excludedTypes=new Set(['atrayente','bacterizida','coadyuvantes','detergente','fungicida','insecticida','productos limpieza y desinfeccion instalaciones','solo en trampas','sustancia basica','tratamientos postcosecha']);
const fold=s=>String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
const sameText=(a,b)=>fold(a).replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'")===fold(b).replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'");
function text(html){return String(html).replace(/<[^>]*>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,num)=>String.fromCodePoint(parseInt(hex||num,hex?16:10))).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g,v=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[v]).replace(/\s+/g,' ').trim();}
function safeUrl(url){const u=new URL(url);if(u.origin!==BASE.slice(0,-1))throw Error('INTERECO: enlace fuera de su directorio');return u.href;}
function date(value){const m=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;const iso=`${m[3]}-${m[2]}-${m[1]}`;const parsed=new Date(iso+'T12:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)throw Error('INTERECO: fecha publicada inválida');return iso;}
async function index(endpoint,downloadPublic){const result=[],ids=new Set();for(let page=1;page<=30;page++){const payload=JSON.parse((await downloadPublic(REST+endpoint+'?per_page=100&orderby=id&order=asc&page='+page)).toString('utf8'));if(!Array.isArray(payload))throw Error('INTERECO: respuesta REST inesperada');for(const item of payload){if(!Number.isSafeInteger(item.id)||ids.has(item.id))throw Error('INTERECO: índice paginado ambiguo');ids.add(item.id);result.push(item);}if(payload.length<100)return result;}throw Error('INTERECO: índice excede límite de seguridad');}
export function parseInterecoCompany(html){
 const items=new Map(),starts=[...String(html).matchAll(/<div\b[^>]*class="[^"]*\bjet-listing-grid__item\b[^\"]*"[^>]*data-post-id="(\d+)"[^>]*>/g)];
 for(let i=0;i<starts.length;i++){
  const id=Number(starts[i][1]),block=html.slice(starts[i].index,i+1<starts.length?starts[i+1].index:undefined);
  const fields=[...block.matchAll(/jet-listing-dynamic-field__content[^>]*>([\s\S]*?)<\/div>/g)].map(m=>text(m[1]));
  const name=fields[0],dates=fields.slice(1).filter(v=>/^\d{2}\/\d{2}\/\d{4}$/.test(v));
  if(!name||new Set(dates).size>1)throw Error('INTERECO: ficha sin nombre o con fechas ambiguas');
  const terms=[...block.matchAll(/<a\b[^>]*href="(https:\/\/interecoweb\.com\/(?:empresa|tipo)\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({url:safeUrl(m[1]),name:text(m[2])}));
  const manufacturers=terms.filter(t=>t.url.includes('/empresa/')),types=terms.filter(t=>t.url.includes('/tipo/'));
  if(manufacturers.length!==1||!types.length||items.has(id))throw Error('INTERECO: empresa o tipo de ficha ambiguos');
  items.set(id,{name,manufacturer:manufacturers[0].name,manufacturerUrl:manufacturers[0].url,types:types.map(t=>t.name),validUntil:dates.length?date(dates[0]):null});
 }
 return items;
}
export async function collectIntereco(checkedAt,downloadPublic){
 if(!Number.isFinite(Date.parse(checkedAt)))throw Error('INTERECO: fecha de consulta inválida');
 const [products,companies,types]=await Promise.all([index('insumos',downloadPublic),index('empresa',downloadPublic),index('tipo',downloadPublic)]);
 if(products.length<100||companies.length<10||types.length<10)throw Error('INTERECO: cobertura inesperadamente pequeña');
 const companiesById=new Map(companies.map(c=>[c.id,c])),typesById=new Map(types.map(t=>[t.id,text(t.name)])),expectedByCompany=new Map();
 for(const product of products){
  if(!Array.isArray(product.empresa)||product.empresa.length!==1||!product.tipo?.length||!text(product.title?.rendered))throw Error('INTERECO: producto sin identificación inequívoca');
  const companyId=product.empresa[0];if(!companiesById.has(companyId)||product.tipo.some(t=>!typesById.has(t)))throw Error('INTERECO: taxonomía incompleta');
  const list=expectedByCompany.get(companyId)||[];list.push(product);expectedByCompany.set(companyId,list);
 }
 const entries=[...expectedByCompany],rows=[];let cursor=0;
 async function worker(){while(cursor<entries.length){const [companyId,expected]=entries[cursor++],company=companiesById.get(companyId),url=safeUrl(company.link),found=new Map();
  // Archive page size is published by JetEngine and is cross-checked against
  // REST IDs rather than assuming the first ten products are the whole company.
  const first=(await downloadPublic(url)).toString('utf8');
  const nav=first.match(/data-nav="([^\"]+)"/)?.[1];if(!nav)throw Error('INTERECO: paginación de empresa no publicada');
  const settings=JSON.parse(text(nav)),query=settings.query||{},total=Number(query.found_posts),pages=Number(query.max_num_pages);
  if(total!==expected.length||!Number.isSafeInteger(pages)||pages<1||pages>100)throw Error('INTERECO: índice y archivo de empresa no coinciden');
  for(let page=1;page<=pages;page++){
   const html=page===1?first:(await downloadPublic(new URL('page/'+page+'/',url).href)).toString('utf8');
   const parsed=parseInterecoCompany(html);if(!parsed.size)throw Error('INTERECO: página de empresa vacía');
   for(const [id,item] of parsed){const old=found.get(id);if(old&&JSON.stringify(old)!==JSON.stringify(item))throw Error('INTERECO: ficha contradictoria entre páginas de '+company.name);found.set(id,item);}
  }
  const expectedIds=new Set(expected.map(p=>p.id));if([...found.keys()].some(id=>!expectedIds.has(id)))throw Error('INTERECO: archivo contiene producto ajeno a empresa');
  for(const product of expected){const item=found.get(product.id),name=text(product.title.rendered),manufacturer=text(company.name),publishedTypes=product.tipo.map(id=>typesById.get(id));
   if(item&&(!sameText(item.name,name)||!sameText(item.manufacturer,manufacturer)||item.manufacturerUrl!==url||publishedTypes.some(t=>!item.types.includes(t))||item.types.some(t=>!publishedTypes.includes(t))))throw Error('INTERECO: ficha e índice discrepan ('+product.id+' '+name+')');
   if(publishedTypes.every(t=>excludedTypes.has(fold(t))))continue;
   const unknown=publishedTypes.every(t=>['otros','otros insumos','omdf','producto ecologico'].includes(fold(t)));
   rows.push({name:item?.name||name,manufacturer,type:publishedTypes.join('; '),...(unknown?{family:'Otros insumos'}:{}),country:'España (directorio INTERECO)',evidence:[{issuer:'INTERECO',scheme:'Directorio de insumos certificados',sourceUrl:item?url:REST+'insumos/'+product.id,checkedAt,validFrom:null,validUntil:item?.validUntil||null,certificateNumber:null,present:true,conditions:'Consultar las condiciones del certificado y la etiqueta del producto. La inclusión en este directorio no verifica una aplicación, dosis o cultivo concreto.'+(unknown?' La categoría publicada no identifica un uso nutricional; comprobar el uso exacto en su documentación.':'')+(!item?' Producto publicado en el índice oficial INTERECO; la paginación del archivo de empresa no permite recuperar su fecha de caducidad.':''),scope:'Producción ecológica'}]});
  }
 }}
 await Promise.all(Array.from({length:4},worker));
 if(rows.length<100)throw Error('INTERECO: cobertura de nutrición y suelo inesperadamente pequeña');
 return rows.sort((a,b)=>a.name.localeCompare(b.name,'es')||a.manufacturer.localeCompare(b.manufacturer,'es'));
}
