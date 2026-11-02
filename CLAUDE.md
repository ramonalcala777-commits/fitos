# Fitos · Pistacho y almendro — instrucciones de mantenimiento

Web de Ramón Alcalá (consultor agrónomo, Albacete) para consultar fitosanitarios del registro MAPA
para pistacho, almendro y frutos de cáscara, insumos ECO certificados y autorizaciones excepcionales.

- Web: https://ramonalcala777-commits.github.io/fitos/
- Repositorio: ramonalcala777-commits/fitos (público, gratis)
- Antes estaba alojada en ChatGPT (Sites, `fitos-pistacho-almendro.ramonalcala777.chatgpt.site`,
  proyecto `appgprj_6ac60e916a2c8191a45f3e3fba484f5c`). Se migró aquí el 02/11/2026 para que la lleve Claude.

## Cómo trabajar con Ramón
- No es técnico: explicar en español sencillo, sin jerga.
- No tocar nada sin su visto bueno: primero la lista completa de cambios, luego esperar su «adelante».
- Ir contándole cada paso con avisos breves.
- Tras cada cambio, actualizar las DOS copias de la carpeta del proyecto y comprobar que coinciden:
  `C:\Users\Ramón Alcalá\Desktop\web fitosanitarios` y `G:\Mi unidad\Ramón\PROYECTOS\web fitosanitarios`.
  No borrar nada del destino.

## Cómo funciona
- Web estática (React + Vite). Lee los datos de `public/data/*.json`. No hay servidor ni base de datos.
- `.github/workflows/publicar.yml`:
  - viernes y sábados a las 15:30 (Madrid) ejecuta `scripts/actualizar.mjs`, guarda los datos en el repo y publica;
  - cada push a `main` vuelve a publicar;
  - se puede lanzar a mano (Actions → «Actualizar y publicar» → Run workflow), con la opción «apartados» para actualizar solo algunos.
- `scripts/actualizar.mjs` hace lo que antes hacían el actualizador externo y el servidor (`/api/import`,
  `/api/inputs`, `/api/ecology`, `/api/exceptions`), con las mismas validaciones. Apartados independientes:
  `node scripts/actualizar.mjs mapa` (o `insumos`, `normativa`, `excepcionales`, separados por comas).
  Si un apartado falla, conserva su última versión válida y el workflow acaba en rojo (GitHub avisa por correo).
  `public/data/ultima-actualizacion.json` guarda el resultado de cada apartado.

## Archivos de datos (public/data)
| Archivo | Contenido |
|---|---|
| pistacho.json, almendro.json, cascara.json | Catálogo MAPA en bruto por cultivo (con usos, alias y cambios) |
| estado-<cultivo>.json | Último intento de actualización de ese cultivo |
| normativa-eco.json | Comprobación de versiones consolidadas de 2021/1165 y 540/2011 (servicio SPARQL de la Oficina de Publicaciones de la UE; EUR-Lex como alternativa). Si aparece una versión nueva vigente, se suspenden las etiquetas ECO hasta revisar `lib/eco.mjs` y actualizar `ECO_REVIEW_BASELINE` en `lib/check-eco-law.mjs` |
| excepcionales.json | Archivo histórico de autorizaciones excepcionales (nunca se borran registros) |
| insumos.json, insumos-detalles.json | Insumos ECO de certificadoras y fichas ampliadas |
| insumos-manuales.json | Certificados ECO comprobados a mano (p. ej. Agrocolor). Obligatorio: enlace https al certificado oficial, caducidad, fecha y autor de la comprobación (`verification: "manual"`). Valen hasta su caducidad |
| excepcionales-revisiones.json | Revisión asistida de excepcionales nuevas/modificadas: `estado: "propuesta"` (no se aplica) o `"revisada"` (solo con visto bueno de Ramón). `sustituye` marca la versión anterior |
| cambios-historial.json | Cambios del registro MAPA por semana y cultivo (6 meses) |
| novedades.json | Novedades de la última ejecución; si hay, el workflow abre un aviso (issue) que llega por correo |
| generado/ | Lo crea `scripts/preparar-insumos.mjs` al compilar: lista ligera de insumos y fichas en 32 partes (no se guarda en git) |

La unión pistacho/almendro + grupo «Frutales de cáscara» y la etiqueta ECO se calculan en el navegador
(`lib/catalog-view.mjs`, `lib/eco.mjs`). Los insumos se decoran en el navegador (`lib/inputs-core.mjs`) porque
la aptitud depende de la fecha del día.

## Reglas de contenido (no negociables)
- No inventar autorizaciones, dosis, vigencias, certificados ni aptitud ECO. Mantener trazabilidad por cultivo y territorio.
- ECO de fitosanitarios = elegibilidad normativa por sustancia y uso; no es certificación comercial.
  Insumos ECO = evidencia de certificadoras. No mezclar.
- Un fallo de consulta conserva la evidencia y la fecha anteriores; no renovar fechas para disimularlo.
- Excepcionales: cobertura pública desde junio de 2016; documentos nuevos o modificados quedan
  «pendientes de revisión» sin periodo inventado. No atribuir la vigencia de un cultivo a otro.
- Conservar: tres cultivos, etiqueta amarilla del grupo, otras denominaciones (LAIDAN → LAMBDASTAR),
  calculadora de dosis, filtro ECO por uso, filtro de marca en insumos (Timac Agro), orden de excepcionales
  de más reciente a más antiguo.

## Otras piezas
- `public/sw.js` + `manifest.webmanifest`: funciona sin cobertura (datos guardados en el móvil, red primero).
- CERES: el workflow le da 25 minutos y 40 fallos para descargar confirmaciones (`CERES_PRESUPUESTO_MINUTOS`, `CERES_MAX_FALLOS`).
- Control Union publica su lista EU vacía (0 KB) y sus fichas piden usuario; Agrocolor no publica listado (solo formulario): sus productos se añaden a mano.
- `lib/mapa.mjs` empareja fichas por registro cuando MAPA renumera el IdProducto y describe el tipo de cambio.

## Comprobar antes de publicar
`npm ci --ignore-scripts && npm test && npm run build`
(`npm test` = pruebas de dosis, ECO y estructura de datos). Para cambios visuales, revisar la página en el navegador.
