export const CROP_CODES={pistacho:'0101020604000000',almendro:'0101020601000000',cascara:'0101020600000000'};
export function matchesUse(crop,use){const code=String(use.CodigoCultivo||'');if(!/^\d{16}$/.test(code))return false;const prefix=code.replace(/0+$/,'');return prefix.length>0&&CROP_CODES[crop].startsWith(prefix);}
export function enrichSnapshot(snapshot,official,sourceDate,digest){
 const byId=new Map(official.Productos.map(p=>[p.DATOSPRODUCTO.IdProducto,p]));
 let missing=0;
 snapshot.products=snapshot.products.map(p=>{const source=byId.get(p.IdProducto);if(p.Estado==='Vigente'&&!source)missing++;const aliases=[...new Set([...(source?.OTRASDENOMINACIONES||[]).map(n=>n.Nombre_Origen),...(source?.OTROSNOMBRES||[]).map(n=>n.Nombre)].filter(n=>typeof n==='string'&&n.trim()&&n!==p.Nombre))].sort((a,b)=>a.localeCompare(b,'es'));return {...p,aliases,uses:(source?.USOS||[]).filter(u=>matchesUse(snapshot.crop,u)),composition:source?.COMPOSICION||[]};});
 if(missing>0)throw new Error('Hay '+missing+' fichas vigentes sin correspondencia en el listado de usos autorizados');
 snapshot.sourceDate=sourceDate;snapshot.sourceDigest=digest;snapshot.usesIncluded=true;
 return snapshot;
}
