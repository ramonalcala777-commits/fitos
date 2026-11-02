// Prueba sin conexión de la comprobación de versiones normativas ECO.
import assert from 'node:assert/strict';
import {checkEcoLaw,consolidatedVersions,pickCurrentVersion,SPARQL_ENDPOINT} from '../lib/check-eco-law.mjs';
const b=c=>({celex:{value:c}});
const v1165=['02021R1165-20210716','02021R1165-20250615','02021R1165-20260101','02008R0889-20220101'].map(b);
const v540=['02011R0540-20260401','02011R0540-20260721','02011R0540-2026x721','02011R0540-20270101'].map(b);
assert.deepEqual(consolidatedVersions(v1165,'32021R1165'),['2021-07-16','2025-06-15','2026-01-01']);
const now=new Date('2026-11-02T12:00:00Z');
assert.deepEqual(pickCurrentVersion(consolidatedVersions(v540,'32011R0540'),'2026-07-21',now),{currentVersion:'2026-07-21',upcomingVersions:['2027-01-01']});
assert.throws(()=>pickCurrentVersion(['2025-01-01'],'2026-01-01',now),/versión revisada/);
const ok=(json)=>({ok:true,json:async()=>json,text:async()=>''});
const fetcher=async url=>{if(!url.startsWith(SPARQL_ENDPOINT))return {ok:false,status:403};const q=decodeURIComponent(url);return ok({results:{bindings:q.includes('02021R1165-')?v1165:v540}});};
let r=await checkEcoLaw(fetcher,now);assert.equal(r.status,'unchanged');assert.equal(r.verified,true);assert.equal(r.requiresReview,false);
const changed=async url=>{const q=decodeURIComponent(url);return ok({results:{bindings:q.includes('02021R1165-')?[...v1165,b('02021R1165-20261015')]:v540}});};
r=await checkEcoLaw(changed,now);assert.equal(r.status,'review-required');assert.equal(r.requiresReview,true);assert.equal(r.laws[0].currentVersion,'2026-10-15');
r=await checkEcoLaw(async()=>({ok:false,status:503}),now);assert.equal(r.status,'unavailable');assert.equal(r.verified,false);
console.log('Normativa ECO: versiones consolidadas, vigente frente a futura, cambio y servicio caído: OK');
