# Certificado raíz de la FNMT

`fnmt-raiz-servidores-seguros-g2r.pem` es la raíz «AC RAIZ FNMT-RCM SERVIDORES SEGUROS G2R» de la
Fábrica Nacional de Moneda y Timbre (válida hasta 12/12/2040).

Desde finales de 2025 www.mapa.gob.es usa certificados de esta raíz nueva, que todavía no está en la lista
de confianza de Node.js ni de Linux. Sin ella, la descarga del XLS de autorizaciones excepcionales del MAPA
falla con «self-signed certificate in certificate chain» (por eso el historial de excepcionales estaba
parado desde el 07/10/2026).

- Descargada el 02/11/2026 de la sede oficial: https://www.sede.fnmt.gob.es/es/descargas/certificados-raiz-de-la-fnmt
- Huella SHA-1 (coincide con la publicada por la FNMT): 19:87:94:8D:AB:7D:62:00:9E:2D:6B:BE:D8:83:DC:3A:F5:67:99:E8
- Huella SHA-256: FC:23:DD:FB:7A:A5:05:D6:05:B2:F4:92:FA:15:87:E3:73:8A:07:4A:17:C0:CF:06:FA:DF:C7:25:65:0F:A4:2A

Se añade a las raíces de confianza (NODE_EXTRA_CA_CERTS) solo en el actualizador. No se desactiva ninguna
comprobación de seguridad. Cuando Node.js la incluya de serie, este archivo dejará de ser necesario.
