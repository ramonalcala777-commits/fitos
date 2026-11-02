// Comprobación rápida de los datos publicados antes de cada publicación.
// No depende de productos concretos: solo de que los archivos estén completos y coherentes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalogView} from '../lib/catalog-view.mjs';
import {decorateInput} from '../lib/inputs-core.mjs';
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
console.log('Datos correctos: catálogos, excepcionales ('+ex.records.length+'), insumos ('+ins.products.length+') y normativa ('+ecology.status+').');
