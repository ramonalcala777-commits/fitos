export const foldInput=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function inputFamily(type){const t=foldInput(type);if(/^(otros|otros insumos|omdf)$/.test(t))return 'Otros insumos';if(/bioestimulante|biostimulant/.test(t))return 'Bioestimulantes';if(/microorganismo|micro organism|microbial|micorr|inocul/.test(t))return 'Microorganismos y micorrizas';if(/enmienda|compost|humic|sustrato|substrate|growing media|soil additive|soil improver|liming|peat/.test(t))return 'Enmiendas y suelo';if(/micronutr|oligoelement|quelato|chelat|complejad|trace element|boro|hierro|iron|cobre|copper|zinc|manganes/.test(t))return 'Correctores y micronutrientes';if(/aminoacido|amino acid|alga|seaweed/.test(t))return 'Algas y aminoácidos';return 'Abonos y otros fertilizantes';}
export function inputEvidence(e,now=new Date()){
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(now);
 if(e.verification==='confirmation_unavailable')return {eligible:false,label:'Confirmación pendiente de consulta'};
 if(e.present===false)return {eligible:false,label:'Ya no figura en la fuente'};
 if(e.validUntil&&e.validUntil<day)return {eligible:false,label:'Vigencia publicada vencida'};
 if(e.validFrom&&e.validFrom>day)return {eligible:false,label:'Vigencia todavía no iniciada'};
 if(!Number.isFinite(Date.parse(e.checkedAt))||now.getTime()-Date.parse(e.checkedAt)>30*86400000)return {eligible:false,label:'Comprobación pendiente'};
 if(e.verification==='documentary_review')return {eligible:true,label:'ECO · revisión documental'};if(e.verification==='attestation')return {eligible:true,label:'ECO · atestación'};
 return {eligible:true,label:e.validUntil?'ECO · vigencia publicada':'ECO · en directorio'};
}
export function decorateInput(p,now=new Date()){const evidence=p.evidence.map(e=>({...e,...inputEvidence(e,now)}));return {...p,evidence,eligible:evidence.some(e=>e.eligible),state:evidence.some(e=>e.eligible)?'Aptitud documentada':'Pendiente de verificar'};}
