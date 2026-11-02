import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {downloadPublic} from './public-download.mjs';
import https from 'node:https';
const HOST='https://infoxgen2.marmara.work';
export const CERES_DIRECTORY='https://www.ceres-cert.de/de/service/betriebsmittel-fur-die-okologische-produktion';
const EU='C1746FC5-1325-4034-8A6E-DBCAFBEA0068';
const categories=['703448A6-C5DF-4A34-AAE1-06DFBD43D1A6-3','9D7189B4-1646-4881-9598-7D8A3A1D0367-3'];
const plain=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,h,n)=>String.fromCodePoint(parseInt(h||n,h?16:10))).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[n]).replace(/\s+/g,' ').trim();
const same=(a,b)=>plain(a).normalize('NFKC').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim()===plain(b).normalize('NFKC').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim();
const safe=url=>{const u=new URL(url,HOST);if(u.origin!==HOST)throw Error('CERES: fuente fuera del directorio');return u.href;};
const date=s=>{const m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(!m)throw Error('CERES: formato de vigencia cambiado');const iso=`${m[3]}-${m[2]}-${m[1]}`,d=new Date(iso+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)throw Error('CERES: vigencia inválida');return iso;};
async function pool(items,fn,n=4){let cursor=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(cursor<items.length){const i=cursor++;result[i]=await fn(items[i],i);}}));return result;}
export function rotateCeresProviders(groups,checkedAt){
 // Move the queue every Monday-to-Sunday week. All suppliers, including
 // Spanish and foreign ones, eventually lead the limited confirmation queue.
 // The initial seed remains unchanged; repeated runs within a week are stable.
 const sorted=[...groups].sort(([a],[b])=>a.localeCompare(b,'en'));
 if(!sorted.length)return sorted;
 const gcd=(a,b)=>b?gcd(b,a%b):a;let stride=Math.max(1,Math.ceil(sorted.length/12));
 while(gcd(stride,sorted.length)!==1)stride++;
 const week=Math.floor((Date.parse(checkedAt)+3*86400000)/(7*86400000)),offset=(((week*stride)%sorted.length)+sorted.length)%sorted.length;
 return [...sorted.slice(offset),...sorted.slice(0,offset)];
}
export function parseCeresList(html){const total=Number(html.match(/class="pl-5"[^>]*>\s*(\d+) results/)?.[1]);if(!Number.isSafeInteger(total)||total<0||total>20000)throw Error('CERES: total de productos no identificado');const products=[];for(const match of html.matchAll(/<tr\b[^>]*onclick="location\.href='(\/produkt\/[A-F0-9-]+\?lang=EN)'"[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m=>plain(m[1]));if(cells.length!==3||cells.some(c=>!c))throw Error('CERES: fila sin nombre, proveedor o tipo');products.push({url:safe(match[1]),name:cells[0],manufacturer:cells[1],type:cells[2]});}if(total&&!products.length)throw Error('CERES: listado vacío pese al total publicado');return {total,products};}
export function parseCeresConfirmation(text){
 const name=text.match(/\bProduct:\s*(.*?)\s+Category:/)?.[1]?.trim();
 const expiry=text.match(/This confirmation is valid until:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1];
 if(!name||!expiry)throw Error('CERES: confirmación sin producto o vigencia');
 const standardBlock=text.match(/\bStandard:\s*([\s\S]*?)This confirmation is valid until:/)?.[1]||'';
 if(!/Reg\.\s*\(EU\)\s*2018\/848(?:\s+as amended)?/.test(standardBlock)||/EU[^.]{0,40}equivalent/i.test(standardBlock))return null;
 const euBlock=standardBlock.slice(standardBlock.search(/Reg\.\s*\(EU\)\s*2018\/848/));
 const restriction=euBlock.match(/Restriction:\s*(.*?)(?=\bNOP\b|\bJAS\b|\bLPO\b|$)/)?.[1]?.trim();
 if(restriction===undefined)throw Error('CERES: condiciones de norma UE no identificadas');
 return {name,validUntil:date(expiry),conditions:'Restricciones publicadas para Reg. (EU) 2018/848: '+restriction};
}
async function pdfConfirmations(bytes){const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}).promise;try{if(doc.numPages>500)throw Error('CERES: certificado excesivamente extenso');const pages=[];for(let i=1;i<=doc.numPages;i++){const text=(await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ').replace(/\s+/g,' ');const parsed=parseCeresConfirmation(text);if(parsed)pages.push(parsed);}return pages;}finally{await doc.destroy();}}
// Confirmation generation redirects through a temporary PDF job. Its public
// session cookies are kept only in memory and only on the same directory host.
// Espera por confirmación (CERES genera el PDF al pedirlo; con proveedores grandes tarda). Antes 45 s.
const PDF_WAIT=Math.min(300,Math.max(45,Number(process.env.CERES_ESPERA_PDF_SEGUNDOS)||45))*1000;
async function confirmationBytes(url){const cookies=new Map(),deadline=Date.now()+PDF_WAIT;async function one(url,depth=0){safe(url);if(depth>20||Date.now()>=deadline)throw Error('CERES: confirmación no disponible dentro de '+PDF_WAIT/1000+' segundos');return new Promise((resolve,reject)=>{const req=https.get(url,{agent:false,headers:{Accept:'application/pdf','User-Agent':'Fitos official-source updater',...(cookies.size?{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}:{})}},res=>{for(const cookie of res.headers['set-cookie']||[]){const pair=cookie.split(';')[0],split=pair.indexOf('=');if(split>0)cookies.set(pair.slice(0,split),pair.slice(split+1));}if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return resolve(one(safe(new URL(res.headers.location,url).href),depth+1));}if(res.statusCode!==200){res.resume();return reject(Error('CERES: PDF HTTP '+res.statusCode));}const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>20000000){req.destroy(Error('CERES: PDF demasiado grande'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(chunks)));});req.setTimeout(Math.max(1,deadline-Date.now()),()=>req.destroy(Error('CERES: confirmación agotó '+PDF_WAIT/1000+' segundos')));req.on('error',reject);});}return one(url);}
export async function collectCeres(checkedAt,download=downloadPublic){
 if(!Number.isFinite(Date.parse(checkedAt)))throw Error('CERES: fecha de consulta inválida');
 const products=new Map();
 for(const category of categories){
  const base=`${HOST}/produkte?type=CERES&lang=EN&ebene0=${category}&freigaben=${EU}`;
  const first=parseCeresList((await download(base)).toString('utf8'));if(first.total===0)continue;
  const perPage=first.products.length,pages=Math.ceil(first.total/perPage);if(pages>150||perPage<1)throw Error('CERES: paginación excede límite');
  const found=await completeCeresPages(base,first,pages,download);
  for(const [id,row] of found){const old=products.get(id);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw Error('CERES: categorías contradictorias');products.set(id,row);}
 }
 if(products.size<50)throw Error('CERES: cobertura inesperadamente pequeña');
 const grouped=new Map();for(const row of products.values()){const list=grouped.get(row.manufacturer)||[];list.push(row);grouped.set(row.manufacturer,list);}
 // Tiempo y fallos permitidos para descargar confirmaciones (PDF). En ChatGPT era 1 minuto y 3 fallos;
 // en GitHub Actions hay margen: el workflow fija CERES_PRESUPUESTO_MINUTOS y CERES_MAX_FALLOS.
 const budgetMinutes=Math.min(60,Math.max(1,Number(process.env.CERES_PRESUPUESTO_MINUTOS)||1)),maxFailures=Math.min(200,Math.max(3,Number(process.env.CERES_MAX_FALLOS)||3));
 let failedCertificates=0;const certificateDeadline=Date.now()+budgetMinutes*60000;
 const groups=rotateCeresProviders([...grouped],checkedAt);
 const batches=await pool(groups,async([manufacturer,rows])=>{
  const first=(await download(rows[0].url)).toString('utf8');
  if(!same(first.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]||'',rows[0].name))throw Error('CERES: nombre de ficha diferente del listado');
  const company=plain(first.match(/<td>Company:<\/td>\s*<td>([\s\S]*?)<\/td>/)?.[1]||'');if(!same(company,manufacturer))throw Error('CERES: proveedor de ficha diferente del listado');
  const place=plain(first.match(/<td>Postal Code, Place:<\/td>\s*<td>([\s\S]*?)<\/td>/)?.[1]||'');
  const country=place.includes(' - ')?place.split(' - ')[0]:null;
  const certificate=first.match(/href="(\/produkt-pdf-liste\/[^\"]+)"/)?.[1],sourceUrl=certificate?safe(plain(certificate)):null;let confirmations=[],confirmationError='Confirmación pendiente: no se ha podido comprobar su vigencia.';
  if(sourceUrl&&failedCertificates<maxFailures&&Date.now()<certificateDeadline){try{confirmations=await pdfConfirmations(await confirmationBytes(sourceUrl));}catch(error){failedCertificates++;confirmationError='Confirmación pendiente: '+error.message;}}
  return rows.map(row=>{const matches=confirmations.filter(c=>same(c.name,row.name)),c=matches.length===1?matches[0]:null;return {name:row.name,manufacturer,type:row.type,...(/strengthener/i.test(row.type)?{family:'Otros insumos'}:{}),...(country?{country:country+' (proveedor publicado; comercialización en España no comprobada)'}:{}),evidence:[{issuer:'CERES',scheme:'Reg. (EU) 2018/848 as amended',sourceUrl:c?sourceUrl:row.url,checkedAt,validFrom:null,validUntil:c?.validUntil||null,certificateNumber:null,present:true,...(!c?{verification:'confirmation_unavailable'}:{}),conditions:(c?c.conditions:confirmationError)+' Consultar la etiqueta y las condiciones completas de la confirmación. CERES no verifica el registro comercial del producto en cada país.',scope:'Agricultura ecológica de la UE'}]};});
 },2);
 const rows=batches.flat().sort((a,b)=>a.name.localeCompare(b.name,'es')||a.manufacturer.localeCompare(b.manufacturer,'es'));rows.collectmetadata={pendingCount:rows.filter(r=>r.evidence[0].verification==='confirmation_unavailable').length,total:rows.length};return rows;
}

// Equal sort keys in the public directory can repeat a row at a page boundary.
// Merge only identical rows and retry a bounded number of complete scans.
// Never accept a scan unless every unique record in the published total exists.
export async function completeCeresPages(base,first,pages,download){
 const found=new Map();
 for(let pass=0;pass<3;pass++){
  const results=pass===0?[first,...await pool(Array.from({length:pages-1},(_,i)=>i+2),async page=>parseCeresList((await download(base+'&page='+page)).toString('utf8')))]:await pool(Array.from({length:pages},(_,i)=>i+1),async page=>parseCeresList((await download(base+'&page='+page,{'Cache-Control':'no-cache'})).toString('utf8')));
  for(const result of results){if(result.total!==first.total)throw Error('CERES: listado cambió durante lectura');for(const row of result.products){const prior=found.get(row.url);if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('CERES: ficha contradictoria entre páginas');found.set(row.url,row);}}
  if(found.size===first.total)return found;if(found.size>first.total)throw Error('CERES: listado cambió durante lectura');
 }
 throw Error('CERES: el directorio repite fichas entre páginas; solo se recuperaron '+found.size+' de '+first.total+' productos únicos. Se conserva la consulta anterior.');
}
