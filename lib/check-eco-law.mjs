import { pathToFileURL } from 'node:url';
export const ECO_REVIEW_BASELINE = {
  reviewedAt: '2026-10-07',
  '2021/1165': { version: '2026-01-01', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:02021R1165-20260101' },
  '540/2011': { version: '2026-07-21', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:02011R0540-20260721' },
};
export function parseCurrentVersion(html) {
  if (!html || /verify that you.re not a robot|javascript is disabled|enable javascript|captcha|request rejected/i.test(html)) throw new Error('EUR-Lex no devolvió contenido normativo verificable.');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const match = text.match(/Access current version\s*\(\s*(\d{2})\/(\d{2})\/(\d{4})\s*\)/i);
  if (!match) throw new Error('No se pudo identificar explícitamente la versión vigente en el índice oficial.');
  return `${match[3]}-${match[2]}-${match[1]}`;
}
export async function checkEcoLaw(fetcher = fetch) {
  const laws = await Promise.all(Object.entries(ECO_REVIEW_BASELINE).filter(([key]) => key !== 'reviewedAt').map(async ([law, baseline]) => {
    try {
      const response = await fetcher(baseline.url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Respuesta HTTP ${response.status}`);
      const currentVersion = parseCurrentVersion(await response.text());
      return { law, ...baseline, currentVersion, status: currentVersion === baseline.version ? 'unchanged' : 'changed', verified: true };
    } catch (error) {
      return { law, ...baseline, currentVersion: null, status: 'unavailable', verified: false, error: error.message };
    }
  }));
  const verified = laws.every(law => law.verified);
  const changed = laws.some(law => law.status === 'changed');
  return {
    checkedAt: new Date().toISOString(), reviewedAt: ECO_REVIEW_BASELINE.reviewedAt,
    status: changed ? 'review-required' : verified ? 'unchanged' : 'unavailable',
    verified, changed, requiresReview: changed,
    mayAutoApproveNewRules: false,
    message: changed ? 'Ha cambiado una versión normativa. Revisar reglas ECO antes de aprobar nuevas etiquetas; suspender la confirmación de vigencia normativa hasta revisión.' : verified ? 'El índice oficial conserva las versiones revisadas. Esta comprobación no reemplaza la revisión de sus disposiciones.' : 'No se ha podido verificar si cambió la normativa. Conservar fecha de revisión anterior; no informar actualización normativa exitosa.',
    laws,
  };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await checkEcoLaw();
  console.log(JSON.stringify(result, null, 2));
  // Caller may persist this separately from MAPA data: inaccessible EUR-Lex must not erase valid official registry imports.
  if (result.status !== 'unchanged') process.exitCode = 2;
}
