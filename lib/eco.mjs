/** Conservative eligibility aid, never a manufacturer certification. */
export const ECO_SOURCE = 'https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02021R1165-20260101';
export const ECO_VERSION = '2026-01-01';
const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const rules = new Map();
const add = (names, conditions = [], options = {}) => names.forEach(name => rules.set(norm(name), { name, conditions, ...options }));
add(['Sulphur', 'Ferric phosphate', 'Potassium hydrogen carbonate', 'Maltodextrin', 'Eugenol', 'Geraniol', 'Thymol', 'Aluminium silicate (aka kaolin)', 'Spinosad', 'Carbon dioxide', 'Kieselgur (diatomaceous earth)', 'Lime sulphur (calcium polysulphide)']);
add(['Paraffin oil/(CAS 8042-47-5)', 'Paraffin oil/(CAS 64742-46-7)', 'Paraffin oil/(CAS 97862-82-3)', 'Paraffin oil/(CAS 72623-86-0)']);
add(['Copper hydroxide', 'Copper oxychloride', 'Copper oxide', 'Bordeaux Mixture', 'Tribasic copper sulphate'], ['Máximo acumulado de 28 kg de cobre por hectárea en 7 años. Comprobar el historial completo de aplicaciones y los límites de la autorización MAPA.'], { conditional: true });
add(['Orange oil', 'Rape seed oil', 'Citronella oil', 'Clove oil', 'Spearmint oil', 'Tea tree oil', 'Fatty acids C7-C18 and C18 unsaturated potassium salts'], ['En producción ecológica no se admite su uso herbicida.'], { noHerbicide: true });
add(['Laminarin'], ['Las algas deben proceder de acuicultura ecológica o recolección sostenible conforme al punto 2.4 de la parte III del anexo II del Reglamento (UE) 2018/848. Verificar documentación de origen.'], { conditional: true });
add(['Pyrethrins'], ['Las piretrinas deben extraerse de plantas. Verificar documentación de origen.'], { conditional: true });
add(['Azadirachtin (Margosa extract)'], ['Extraída de semillas del árbol del neem (Azadirachta indica). Verificar documentación de origen.'], { conditional: true });
add(['Hydrolysed proteins'], ['Se excluye la gelatina. Si se mezcla con insecticida, todos los componentes deben ser compatibles con producción ecológica. Verificar composición/origen y mezcla.'], { conditional: true });
add(['Lecithin'], ['Sustancia básica: utilizar conforme al informe de revisión UE; no se admite uso herbicida. Las mezclas requieren evaluar todos sus componentes.'], { noHerbicide: true, conditional: true });
add(['COS-OGA', 'Cerevisane', 'ABE-IT 56'], ['Sin origen OMG; para ABE-IT 56, tampoco medios de cultivo de origen OMG. Verificar documentación.'], { conditional: true });
// Exact MAPA NombreUE identifiers observed in the supplied official catalogue.
// Deliberately do not identify a micro-organism merely by a genus-prefix regex.
add([
  'Coniothyrium minitans Strain CON/M/91-08 (DSM 9660)',
  'Trichoderma atroviride (formerly T. harzianum) strain T11',
  'Trichoderma asperellum (formerly T. viride) strain T-25',
  'Trichoderma afroharzianum (formerly T. harzianum) strain T-22',
  'Aureobasidium pullulans (strains DSM 14940 and DSM 14941)',
  'Beauveria bassiana strain ATCC 74040', 'Beauveria bassiana strain GHA',
  'Trichoderma atroviride strain I-1237', 'Trichoderma atroviride strain SC1',
  'Bacillus thuringiensis subsp. Kurstaki strain PB 54',
  'Bacillus thuringiensis subsp. Aizawai strain ABTS-1857',
  'Bacillus thuringiensis subsp. Kurstaki strain ABTS-351',
  'Bacillus thuringiensis subsp. Kurstaki strain EG2348',
  'Bacillus thuringiensis subsp. Kurstaki strain SA 11',
  'Bacillus thuringiensis subsp. Kurstaki strain SA 12',
  'Clonostachys rosea strain J1446 (Gliocladium catenulatum strain J1446)',
  'Bacillus subtilis strain IAB/BS03',
  'Purpureocillium lilacinum strain 251 (former Paecilomyces lilacinus strain 251)',
  'Bacillus amyloliquefaciens subsp. plantarum D747',
  'Bacillus amyloliquefaciens strain FZB24',
  'Bacillus amyloliquefaciens (formerly subtilis) str. QST 713',
  'Cydia pomonella Granulovirus (CpGV)', 'Pythium oligandrum strain M1',
], ['Microorganismo: comprobar que la cepa figura en las partes A, B o D del Reglamento (UE) 540/2011, ausencia de origen OMG y condiciones del informe de revisión UE.'], { conditional: true });
rules.get(norm('Bacillus amyloliquefaciens (formerly subtilis) str. QST 713')).conditions.push('QST 713 en pulverización al aire libre: en cultivos en flor o con malas hierbas en flor, aplicar fuera del período diario de pecoreo de las abejas y respetar las medidas de reducción de deriva y zonas tampón autorizadas.');
rules.get(norm('Bacillus thuringiensis subsp. Aizawai strain ABTS-1857')).conditions.push('ABTS-1857: atender a la protección de polinizadores. Para cultivos comestibles de consumo en fresco, intervalo mínimo de 2 días hasta cosecha, salvo datos que acrediten menos de 10⁵ UFC/g al cosechar. Respetar además el plazo MAPA del uso.');
add([
  '(E,E)-8,10-Dodecadien-1-ol (SCLP Alcohols)',
  '(E)-5-Decen-1-yl acetate (SCLP Acetates)', '(E)-5-Decen-1-ol (SCLP Alcohols)',
  '(E,Z)-2,13-Octadecadien-1-yl acetate (SCLP Acetates)',
  '(E,Z)-3,13-Octadecadien-1-yl acetate (SCLP Acetates)',
  '(Z)-8-Dodecen-1-yl acetate (SCLP Actetates)',
  '(E)-8-Dodecen-1-yl acetate (SCLP Acetates)', '(Z)-8-Dodecen-1-ol (SCLP Alcohols)',
], ['Feromonas/semioquímicos: respetar las condiciones de autorización de la sustancia y del producto.']);
add(['Deltamethrin'], ['Solo en trampas con atrayentes específicos contra Bactrocera oleae, Ceratitis capitata o Rhagoletis completa.'], { traps: ['bactrocera oleae', 'ceratitis capitata', 'rhagoletis completa'] });
add(['lambda-Cyhalothrin'], ['Solo en trampas con atrayentes específicos contra Bactrocera oleae o Ceratitis capitata.'], { traps: ['bactrocera oleae', 'ceratitis capitata'] });

function evaluate(product) {
  const base = { source: ECO_SOURCE, version: ECO_VERSION, certified: false };
  const composition = product.composition || [];
  if (product.Estado !== 'Vigente') return { ...base, status: 'not-established', label: '', conditions: ['El producto no consta como vigente en este catálogo MAPA.'], uses: [] };
  if (!composition.length) return { ...base, status: 'not-established', label: '', conditions: ['No se dispone de composición oficial suficiente para evaluar ECO.'], uses: [] };
  const matched = composition.map(c => rules.get(norm(c.NombreUE)));
  const unknown = composition.filter((_, i) => !matched[i]).map(c => c.NombreUE || c['Nombre Sustancia']);
  if (unknown.length) return { ...base, status: 'not-established', label: '', conditions: ['Elegibilidad ECO no acreditada por estas reglas. Sin etiqueta no significa evaluación negativa definitiva.'], unknown, uses: [] };
  const conditions = [...new Set(matched.flatMap(r => r.conditions))];
  const uses = (product.uses || []).map((use, index) => {
    const localText = norm([use.MetodoAplicacion, use.CondicionamientoEspecifico, use['Unidad Medida dosis']].join(' '));
    const text = norm([localText, product.Condicionamiento].join(' '));
    const agent = norm(use.Agente);
    const herbicide = /malas hierbas|herbicida|dicotiledoneas|dicotiledóneas|gramineas|gramíneas/.test(norm(use.Agente)) || (product.categories || []).some(category => norm(category) === 'herbicida');
    const excluded = matched.some(r => r.noHerbicide && herbicide);
    const traps = matched.filter(r => r.traps);
    // Missing attractant evidence becomes an explicit condition, never a blanket spray approval.
    const trapValid = traps.every(r => r.traps.some(pest => agent.includes(pest)) && /trampa|trampeo/.test(text) && !/pulveriz/.test(localText));
    const status = excluded || !trapValid ? 'excluded-use' : matched.some(r => r.conditional) || traps.length ? 'conditional' : 'eligible';
    return { index, status, conditions: excluded ? ['Este uso herbicida no está permitido en producción ecológica.'] : !trapValid ? ['No se acredita el uso en trampas con atrayentes específicos y contra las plagas admitidas. La pulverización no está permitida en ECO para esta sustancia.'] : conditions };
  });
  const qualifying = uses.filter(u => u.status !== 'excluded-use');
  if (!qualifying.length) return { ...base, status: 'not-established', label: '', conditions, uses };
  const status = qualifying.some(u => u.status === 'conditional') || qualifying.length !== uses.length ? 'conditional' : 'eligible';
  return { ...base, status, label: status === 'conditional' ? 'ECO · condiciones' : 'ECO', conditions, uses, substances: composition.map(c => c.NombreUE) };
}

export function classifyEco(product) {
  const result = evaluate(product);
  const eligible = ['eligible', 'conditional'].includes(result.status);
  return {
    ...result, eligible,
    conditional: result.status === 'conditional',
    useIndexes: result.uses.filter(u => ['eligible', 'conditional'].includes(u.status)).map(u => u.index),
    sources: [
      { title: 'Reglamento (UE) 2021/1165, anexo I · consolidado 01-01-2026', url: ECO_SOURCE },
      { title: 'Reglamento (UE) 540/2011 · sustancias aprobadas y condiciones', url: 'https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02011R0540-20260721' },
      ...(product.composition?.some(c => c.NombreUE === 'Bacillus amyloliquefaciens (formerly subtilis) str. QST 713') ? [{ title: 'QST 713 · renovación y medidas para abejas', url: 'https://eur-lex.europa.eu/eli/reg_impl/2023/1001/oj/spa' }] : []),
      ...(product.composition?.some(c => c.NombreUE === 'Bacillus thuringiensis subsp. Aizawai strain ABTS-1857') ? [{ title: 'ABTS-1857 · renovación y condiciones', url: 'https://eur-lex.europa.eu/eli/reg_impl/2023/1002/oj/spa' }] : []),
    ],
    reviewedAt: '2026-10-07',
    scope: 'Elegibilidad por sustancias y uso oficial. No equivale a certificación comercial. Requiere autorización MAPA vigente y cumplir las condiciones de uso, las restricciones del Reglamento (UE) 540/2011 y la necesidad del tratamiento según el Reglamento (UE) 2018/848.',
    reason: eligible ? 'Al menos un uso oficial coincide con sustancias admitidas; revisar las condiciones indicadas.' : 'No se acredita un uso ECO con los datos y reglas disponibles. Sin etiqueta no significa que se haya emitido una evaluación negativa definitiva.',
  };
}
