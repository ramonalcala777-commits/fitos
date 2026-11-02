export const ORIGIN='https://servicio.mapa.gob.es/regfiweb';
export const CROPS={pistacho:{id:2009,name:'Pistacho'},almendro:{id:2006,name:'Almendro'},cascara:{id:2557,name:'Frutos de cáscara'}};
export const FUNCTIONS=[[1,'Acaricida'],[3,'Antiespumante'],[4,'Antievaporante'],[29,'Atrayente'],[20,'Bactericida'],[36,'Cicatrizante'],[5,'Coadyuvante'],[6,'Defoliante'],[34,'Desinfectante de suelos'],[39,'Detergente'],[26,'Encerado'],[31,'Esterilizante'],[8,'Feromona'],[9,'Fitorregulador'],[10,'Fumigante'],[11,'Fungicida'],[12,'Herbicida'],[40,'Inductor de autodefensa'],[41,'Inoculación de virus'],[13,'Insecticida'],[14,'Mojante'],[15,'Molusquicida'],[16,'Nematicida'],[25,'Otras'],[21,'Repelente'],[19,'Rodenticida'],[22,'Semioquímico'],[24,'Viricida']];
/** @param {string} crop @param {boolean} ancestors @param {number|null} func @param {number|null} plaga */
export async function exportProducts(crop,ancestors=true,func=null,plaga=null){
 if(!CROPS[crop])throw new Error('Cultivo desconocido');
 const body=new URLSearchParams({'dataDto.idCultivo':String(CROPS[crop].id),'dataDto.ancestrosCultivos':String(ancestors)});
 if(func)body.set('dataDto.idFuncion',String(func));
 if(plaga)body.set('dataDto.idPlaga',String(plaga));
 const r=await fetch(ORIGIN+'/Exportaciones/ExportJsonProductos',{method:'POST',body,headers:{'User-Agent':'Mozilla/5.0 (compatible; Fitos/1.0)','Accept':'application/json, text/plain, */*','X-Requested-With':'XMLHttpRequest'},signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw new Error('MAPA respondió '+r.status);
 let wrapper=await r.json(); if(typeof wrapper==='string')wrapper=JSON.parse(wrapper);
 const data=JSON.parse(wrapper.Contenido);
 if(!Array.isArray(data)||data.some(p=>!Number.isInteger(p.IdProducto)||typeof p.NumRegistro!=='string'||typeof p.Nombre!=='string'||typeof p.Estado!=='string'))throw new Error('Formato de MAPA no reconocido');
 return {data,date:wrapper.Fecha};
}
// Comparación independiente del orden de los campos: solo cuenta un cambio real de contenido.
const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);
export function changesBetween(previous,current){
 const before=new Map((previous?.products||[]).map(p=>[p.IdProducto,p]));const after=new Map(current.map(p=>[p.IdProducto,p]));
 if(!previous)return [];
 const changes=[];
 for(const p of current){const b=before.get(p.IdProducto);if(!b)changes.push({type:'Alta en consulta',name:p.Nombre,registration:p.NumRegistro});else if(stable(b)!==stable(p))changes.push({type:'Cambio de ficha o clasificación',name:p.Nombre,registration:p.NumRegistro});}
 for(const p of before.values())if(!after.has(p.IdProducto))changes.push({type:'Ya no aparece en la consulta',name:p.Nombre,registration:p.NumRegistro});
 return changes;
}
export function validateSnapshot(previous,current){
 if(!current.length)throw new Error('La descarga está vacía; se conserva la versión anterior');
 if(new Set(current.map(p=>p.IdProducto)).size!==current.length)throw new Error('Registros duplicados');
 if(previous&&current.length<previous.products.length*.7)throw new Error('Descenso superior al 30 %; requiere revisión antes de publicar');
}
export async function buildSnapshot(crop,previous=null){
 const indexResponse=await fetch(ORIGIN+'/Productos/Index',{headers:{'User-Agent':'Mozilla/5.0 (compatible; Fitos/1.0)','Accept':'text/html'},signal:AbortSignal.timeout(45000)});
 if(!indexResponse.ok)throw new Error('No se pudo comprobar la lista oficial de funciones (MAPA '+indexResponse.status+')');
 const index=await indexResponse.text();
 const select=index.match(/<select id="cmbFuncionSearch"[\s\S]*?<\/select>/)?.[0];
 const functions=[...(select||'').matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)].map(m=>[Number(m[1]),m[2].replace(/&#x([a-f\d]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).toLocaleLowerCase('es-ES')]).map(([id,name])=>[id,name[0].toUpperCase()+name.slice(1)]);
 if(!functions.length||functions.length>40)throw new Error('La lista de funciones de MAPA cambió; requiere revisión');
 const broad=await exportProducts(crop,true);const direct=await exportProducts(crop,false);
 const directIds=new Set(direct.data.map(p=>p.IdProducto));const categories=new Map();
 // Bounded concurrency; every category comes from the official function filter.
 for(let i=0;i<functions.length;i+=2){await Promise.all(functions.slice(i,i+2).map(async([id,name])=>{const x=await exportProducts(crop,true,id);for(const p of x.data){const a=categories.get(p.IdProducto)||[];a.push(name);categories.set(p.IdProducto,a);}}));}
 const products=broad.data.map(p=>({...p,categories:(categories.get(p.IdProducto)||[]).sort(),direct:directIds.has(p.IdProducto)})).sort((a,b)=>a.IdProducto-b.IdProducto);
 if(direct.data.some(p=>!products.some(b=>b.IdProducto===p.IdProducto)))throw new Error('Las consultas de cultivo no son coherentes');
 // Some official fichas currently return no function, even in FuncionesGrid.
 // Preserve them with an empty classification rather than infer from chemistry.
 if(!products.some(p=>p.categories.length))throw new Error('No se recuperó ninguna función; requiere revisión');
 validateSnapshot(previous,products);
 const sourceDate=broad.date&&/^20\d{2}-/.test(broad.date)?broad.date:null;
 return {crop,checkedAt:new Date().toISOString(),sourceDate,products,changes:changesBetween(previous,products),scope:'Consulta MAPA con categorías superiores; las coincidencias directas se identifican por separado.'};
}
