// Comprobación rápida de los datos publicados antes de cada publicación.
// No depende de productos concretos: solo de que los archivos estén completos y coherentes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogView} from '../lib/catalog-view.mjs';
import {decorateInput} from '../lib/inputs-core.mjs';
import {validateManual} from './preparar-insumos.mjs';
const read=async n=>JSON.parse(await readFile(new URL('../public/data/'+n,import.meta.url),'utf8'));
const group=await read('cascara.json'),ecology=await read('normativa-eco.json');
for(const crop of ['pistacho','almendro','cascara']){
 const data=await read(crop+'.json');
 assert.equal(data.crop,crop);assert(data.usesIncluded,crop+': sin usos');assert(/^20\d\d-/.test(data.checkedAt));
 assert(data.products.length>100,crop+': catálogo demasiado pequeño');
 assert.equal(new Set(data.products.map(p=>p.IdProducto)).size,data.products.length,crop+': registros duplicados');
 const view=catalogView(crop,data,group,ecology);
 if(crop!=='cascara')assert(view.products.some(p=>p.shellGroup),crop+': faltan los productos de frutales de cáscara');
 assert(view.products.every(p=>p.eco&&Array.isArray(p.eco.useIndexes)));
}
const ex=await read('excepcionales.json');assert(ex.records.length>=21,'excepcionales: se han perdido registros');assert(/^20\d\d-/.test(ex.checkedAt));
const ins=await read('insumos.json');assert(ins.products.length>9000,'insumos: catálogo incompleto');assert.equal(new Set(ins.products.map(p=>p.id)).size,ins.products.length);
assert(ins.products.slice(0,50).every(p=>typeof decorateInput(p).eligible==='boolean'));
assert(['unchanged','unavailable','review-required','reviewed'].includes(ecology.status));
// Certificados a mano: enlace, caducidad, fecha y autor de la comprobación obligatorios.
const manual=await read('insumos-manuales.json');const manualErrors=validateManual(manual);assert(!manualErrors.length,manualErrors.join('\n'));
// Revisiones de excepcionales: solo se aplican con visto bueno; fechas válidas; la versión sustituida existe.
const reviews=(await read('excepcionales-revisiones.json')).revisiones||{};const ids=new Set(ex.records.map(r=>r.id));
for(const [id,v] of Object.entries(reviews)){
 assert(ids.has(id),'Revisión de un registro inexistente: '+id);assert(['propuesta','revisada'].includes(v.estado),'Estado de revisión inválido: '+id);
 if(v.estado==='revisada')assert(v.vistoBueno&&v.vistoBueno!=='pendiente','Revisión sin visto bueno: '+id);
 if(v.sustituye)assert(ids.has(v.sustituye),'Sustituye a un registro inexistente: '+v.sustituye);
 for(const p of v.periods||[])assert(/^20\d\d-\d\d-\d\d$/.test(p.from)&&/^20\d\d-\d\d-\d\d$/.test(p.to)&&p.from<=p.to,'Periodo inválido en '+id);
 for(const c of v.crops||[])assert(['almendro','pistacho'].includes(c),'Cultivo inválido en '+id);
}
const hist=await read('cambios-historial.json');assert(Array.isArray(hist.entries)&&hist.entries.every(e=>['pistacho','almendro','cascara'].includes(e.crop)&&Array.isArray(e.changes)&&Number.isFinite(Date.parse(e.date))),'Historial de cambios inválido');
console.log('Datos correctos: catálogos, excepcionales ('+ex.records.length+', '+Object.keys(reviews).length+' revisiones), insumos ('+ins.products.length+', '+(manual.products||[]).length+' a mano), historial ('+hist.entries.length+') y normativa ('+ecology.status+').');
