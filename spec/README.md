# Finanzas Personales Chile

Plataforma personal y multiusuario que extrae movimientos, tarjetas y créditos de la banca en línea
(scraping de solo lectura) y estados de cuenta, los deja en un lago en capas y una bodega dimensional en
Postgres, y responde: en qué se gasta, cuánta deuda en cuotas queda comprometida, cuánto se paga en
intereses y comisiones, y si el mes cierra en negativo. Servicios de AWS emulados con floci.

## Mapa del vault

- [[AGENTS]] — protocolo de trabajo.
- [[ARQUITECTURA]] — flujo, separación por usuario, modelo de datos y categorización.
- [[TODO]] — fases con criterio de término.
- [[DUDAS]] — decisiones abiertas.
- [[CHANGELOG]] — cambios aplicados.
- `fuentes/` — notas por banco y [[Fuentes_de_Datos]] (agregadores evaluados y descartados).
- `decisiones/` — ADRs numerados.
