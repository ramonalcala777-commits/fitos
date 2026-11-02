export const CONTROLUNION_DIRECTORY='https://cucpublications.controlunion.com/publications.aspx?Subprogram_ID=1868&Program_ID=9';

async function read(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||!['cucpublications.controlunion.com','cusi.controlunion.com'].includes(u.hostname))throw Error('Destino Control Union no permitido');
 const response=await fetch(url,{headers:{Accept:'application/pdf,text/html'},redirect:'error',signal:AbortSignal.timeout(45000)});
 const body=await response.text();
 if(body.length>20_000_000)throw Error('Respuesta Control Union demasiado grande');
 return {status:response.status,body};
}

// Recheck the official EU publication each week. A blocked source must never
// become a successful empty import or remove previously documented products.
export async function collectControlUnion(checkedAt){
 if(!checkedAt||!Number.isFinite(Date.parse(checkedAt)))throw Error('Fecha de consulta Control Union inválida');
 const page=await read(CONTROLUNION_DIRECTORY);
 if(page.status!==200)throw Error(`Control Union: publicaciones EU inaccesibles (HTTP ${page.status})`);
 if(!/EU Inputs Global/i.test(page.body))throw Error('Control Union: cambió la identificación del programa EU Inputs');
 const matches=[...page.body.matchAll(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([^<]*Input Active client list\s*\(EU\)[^<]*)<\/a>/gi)];
 if(matches.length!==1)throw Error('Control Union: no publica una lista única de clientes activos EU');
 const documentUrl=new URL(matches[0][1].replaceAll('&amp;','&'),CONTROLUNION_DIRECTORY).href;
 const document=await read(documentUrl);
 if(document.status!==200)throw Error(`Control Union: la lista oficial EU devuelve HTTP ${document.status}. Las fichas individuales del buscador requieren inicio de sesión; no se ha importado un listado sin conformidad EU comprobada.`);
 if(/Internal server error|Please contact system administrator/i.test(document.body))throw Error('Control Union: la descarga de la lista oficial EU comunica un error interno del servidor. Las fichas individuales requieren inicio de sesión.');
 // No successful download has been available to validate its schema. Report
// restored access for review instead of treating client names as products.
 throw Error('Control Union: la descarga oficial EU vuelve a estar accesible; revisar su formato y sus productos antes de importar. El buscador individual requiere inicio de sesión.');
}
