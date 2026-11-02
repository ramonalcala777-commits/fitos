import { pathToFileURL } from 'node:url';
export const ECO_REVIEW_BASELINE = {
  reviewedAt: '2026-10-07',
  '2021/1165': { version: '2026-01-01', celex: '32021R1165', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:02021R1165-20260101' },
  '540/2011': { version: '2026-07-21', celex: '32011R0540', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:02011R0540-20260721' },
};
export function parseCurrentVersion(html) {
  if (!html || /verify that you.re not a robot|javascript is disabled|enable javascript|captcha|request rejected/i.test(html)) throw new Error('EUR-Lex no devolvió contenido normativo verificable.');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const match = text.match(/Access current version\s*\(\s*(\d{2})\/(\d{2})\/(\d{4})\s*\)/i);
  if (!match) throw new Error('No se pudo identificar explícitamente la versión vigente en el índice oficial.');
  return `${match[3]}-${match[2]}-${match[1]}`;
}
// Fuente principal: servicio de datos oficial de la Oficina de Publicaciones de la UE (Cellar),
// el mismo repositorio que alimenta EUR-Lex. Lista las versiones consolidadas (CELEX 0AAAATNNNN-AAAAMMDD).
// EUR-Lex bloquea las consultas automáticas de su web con una comprobación anti-robots, así que su
// página «ALL» queda solo como alternativa.
export const SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
export const SPARQL_SOURCE = 'Oficina de Publicaciones de la UE · Cellar SPARQL';
const madridDay = now => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(now);
export function consolidatedVersions(bindings, baseCelex) {
  const prefix = '0' + baseCelex.slice(1) + '-';
  const dates = [...new Set((bindings || []).map(b => String(b?.celex?.value || ''))
    .filter(c => c.startsWith(prefix) && /^\d{8}$/.test(c.slice(prefix.length)))
    .map(c => { const d = c.slice(prefix.length); return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; }))].sort();
  return dates;
}
export function pickCurrentVersion(dates, baselineVersion, now = new Date()) {
  if (!dates.length) throw new Error('El servicio oficial no devolvió versiones consolidadas.');
  if (!dates.includes(baselineVersion)) throw new Error('La respuesta oficial no contiene la versión revisada; no se puede comparar con seguridad.');
  const today = madridDay(now);
  const current = dates.filter(d => d <= today).pop();
  if (!current) throw new Error('No hay ninguna versión consolidada vigente en la respuesta oficial.');
  return { currentVersion: current, upcomingVersions: dates.filter(d => d > today) };
}
async function sparqlVersion(baseline, fetcher, now) {
  const query = 'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT DISTINCT ?celex WHERE { ?w cdm:resource_legal_id_celex ?celex . FILTER(STRSTARTS(STR(?celex),"0' + baseline.celex.slice(1) + '-")) }';
  const response = await fetcher(SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'Fitos normativa ECO' }, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Servicio oficial: respuesta HTTP ${response.status}`);
  const data = await response.json();
  return pickCurrentVersion(consolidatedVersions(data?.results?.bindings, baseline.celex), baseline.version, now);
}
async function eurLexVersion(baseline, fetcher) {
  const response = await fetcher(baseline.url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Respuesta HTTP ${response.status}`);
  return { currentVersion: parseCurrentVersion(await response.text()), upcomingVersions: [] };
}
export async function checkEcoLaw(fetcher = fetch, now = new Date()) {
  const laws = await Promise.all(Object.entries(ECO_REVIEW_BASELINE).filter(([key]) => key !== 'reviewedAt').map(async ([law, baseline]) => {
    const errors = [];
    for (const [source, read] of [[SPARQL_SOURCE, () => sparqlVersion(baseline, fetcher, now)], ['EUR-Lex', () => eurLexVersion(baseline, fetcher)]]) {
      try {
        const { currentVersion, upcomingVersions } = await read();
        return { law, ...baseline, currentVersion, upcomingVersions, source, status: currentVersion === baseline.version ? 'unchanged' : 'changed', verified: true };
      } catch (error) { errors.push(source + ': ' + error.message); }
    }
    return { law, ...baseline, currentVersion: null, status: 'unavailable', verified: false, error: errors.join(' · ') };
  }));
  const verified = laws.every(law => law.verified);
  const changed = laws.some(law => law.status === 'changed');
  return {
    checkedAt: new Date().toISOString(), reviewedAt: ECO_REVIEW_BASELINE.reviewedAt,
    status: changed ? 'review-required' : verified ? 'unchanged' : 'unavailable',
    verified, changed, requiresReview: changed,
    mayAutoApproveNewRules: false,
    message: changed ? 'Ha cambiado una versión normativa. Revisar reglas ECO antes de aprobar nuevas etiquetas; suspender la confirmación de vigencia normativa hasta revisión.' : verified ? 'Las versiones consolidadas vigentes coinciden con las revisadas. Esta comprobación no reemplaza la revisión de sus disposiciones.' : 'No se ha podido verificar si cambió la normativa. Conservar fecha de revisión anterior; no informar actualización normativa exitosa.',
    laws,
  };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await checkEcoLaw();
  console.log(JSON.stringify(result, null, 2));
  // Caller may persist this separately from MAPA data: inaccessible EUR-Lex must not erase valid official registry imports.
  if (result.status !== 'unchanged') process.exitCode = 2;
}
