// Vista de un catálogo tal y como se muestra en la web.
// Misma lógica que tenía el servidor de ChatGPT (lib/catalog.ts): en pistacho
// y almendro se añaden las autorizaciones directas del grupo «Frutales de
// cáscara» (indicador amarillo) y se calcula la aptitud ECO por uso.
import {classifyEco} from './eco.mjs';

const GROUP_CODE='0101020600000000';

export function catalogView(crop,data,group,ecology){
 const decorate=p=>{const eco=classifyEco(p);return {...p,eco:ecology?.requiresReview?{...eco,eligible:false,reason:'Cambio normativo pendiente de revisión',useIndexes:[]}:eco};};
 if(crop==='cascara')return {...data,ecology,products:data.products.map(decorate)};
 const shell=new Map(group.products.filter(p=>p.direct).map(p=>[p.IdProducto,p]));
 const existing=new Set(data.products.map(p=>p.IdProducto));
 const products=data.products.map(p=>{const shared=shell.get(p.IdProducto);return {...p,shellGroup:!!shared,uses:shared?[...(p.uses||[]).filter(u=>u.CodigoCultivo!==GROUP_CODE),...(shared.uses||[]).filter(u=>u.CodigoCultivo===GROUP_CODE)]:p.uses};});
 for(const p of shell.values())if(!existing.has(p.IdProducto))products.push({...p,direct:false,shellGroup:true});
 return {...data,ecology,products:products.map(decorate)};
}
