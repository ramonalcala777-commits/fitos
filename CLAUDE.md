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
  - se puede lanzar a mano (Actions → «Actualizar y publicar» → Run workflow).
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
| normativa-eco.json | Comprobación de versiones de 2021/1165 y 540/2011 en EUR-Lex |
| excepcionales.json | Archivo histórico de autorizaciones excepcionales (nunca se borran registros) |
| insumos.json, insumos-detalles.json | Insumos ECO de certificadoras y fichas ampliadas |

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

## Comprobar antes de publicar
`npm ci --ignore-scripts && npm test && npm run build`
(`npm test` = pruebas de dosis, ECO y estructura de datos). Para cambios visuales, revisar la página en el navegador.
