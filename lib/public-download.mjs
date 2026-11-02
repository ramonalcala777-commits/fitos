import https from 'node:https';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
const hosts=new Set(['ec.europa.eu','webgate.ec.europa.eu','www.mapa.gob.es','infoxgen2.marmara.work','sohiscert.com','certisbelchim.es','insumosapp.caae.es','interecoweb.com','wz7mdd1v1k.execute-api.eu-west-3.amazonaws.com']);
export async function downloadPublic(url,headers={}){let last;for(let tries=0;tries<3;tries++){try{return await oneDownload(url,0,headers)}catch(e){last=e;if(/EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Tiempo de descarga agotado/.test(String(e.code||'')+' '+e.message)){try{return await fetchDownload(url,headers)}catch(fallback){last=fallback}}await new Promise(r=>setTimeout(r,1000*(tries+1)))}}throw new Error('Descarga oficial '+new URL(url).hostname+new URL(url).pathname+': '+last.message);}
async function oneDownload(url,attempt=0,headers={}){
 if(!hosts.has(new URL(url).hostname))throw new Error('Origen de descarga no autorizado');
 return await new Promise((resolve,reject)=>{const req=https.get(url,{agent:false,headers:{Accept:'*/*','User-Agent':'Fitos official-source updater',...headers}},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(attempt>=4)return reject(new Error('Demasiadas redirecciones'));const next=new URL(res.headers.location,url);return resolve(oneDownload(next.href,attempt+1,next.origin===new URL(url).origin?headers:{}))}if(res.statusCode!==200){res.resume();return reject(new Error('Fuente oficial HTTP '+res.statusCode))}const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>100000000){req.destroy(new Error('Documento demasiado grande'));return}chunks.push(b)});res.on('error',reject);res.on('end',()=>{try{let data=Buffer.concat(chunks);const enc=res.headers['content-encoding'];if(enc==='gzip')data=gunzipSync(data);else if(enc==='deflate')data=inflateSync(data);else if(enc==='br')data=brotliDecompressSync(data);resolve(data)}catch(e){reject(e)}})});req.setTimeout(120000,()=>req.destroy(new Error('Tiempo de descarga agotado')));req.on('error',reject)});
}

// A transient resolver failure in a scheduled environment must not prevent use
// of its supported fetch transport. Both transports enforce the same sources
// and certificate validation; credentials never follow a cross-origin redirect.
async function fetchDownload(url,headers={},redirects=0){
 const u=new URL(url);if(u.protocol!=='https:'||!hosts.has(u.hostname))throw Error('Origen de descarga no autorizado');
 const response=await fetch(url,{redirect:'manual',headers:{Accept:'*/*','User-Agent':'Fitos official-source updater',...headers},signal:AbortSignal.timeout(120000)});
 if(response.status>=300&&response.status<400&&response.headers.get('location')){await response.body?.cancel();if(redirects>=4)throw Error('Demasiadas redirecciones');const next=new URL(response.headers.get('location'),url);return fetchDownload(next.href,next.origin===u.origin?headers:{},redirects+1);}
 if(response.status!==200){await response.body?.cancel();throw Error('Fuente oficial HTTP '+response.status);}
 const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000000){await reader.cancel();throw Error('Documento demasiado grande');}chunks.push(value);}}finally{reader.releaseLock();}return Buffer.concat(chunks);
}
