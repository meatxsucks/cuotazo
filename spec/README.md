# Finanzas Personales Chile

Plataforma personal y multiusuario que extrae movimientos, tarjetas y créditos de la banca en línea
(scraping de solo lectura) y estados de cuenta, los deja en un lago en capas y una bodega dimensional en
Postgres, y responde: en qué se gasta, cuánta deuda en cuotas queda comprometida, cuánto se paga en
intereses y comisiones, y si el mes cierra en negativo. Los datos se publican en Supabase y se ven en la app web
Cuotazo, que se puede compartir con el hogar. Servicios de AWS emulados con floci.

## Mapa del vault

- [[AGENTS]] — protocolo de trabajo.
- [[ARQUITECTURA]] — flujo, separación por usuario, bodega y servicios.
- [[CONTRATO_PRESENTACION]] — tablas y vistas entre bodega, Supabase y app.
- [[APP_WEB]] — pantallas, roles y código de la app.
- [[OPERACION]] — cómo extraer, cargar, publicar, migrar y desplegar; problemas conocidos.
- [[TODO]] — fases con criterio de término.
- [[DUDAS]] — decisiones abiertas.
- [[CHANGELOG]] — cambios aplicados.
- `fuentes/` — notas por banco ([[Santander]], [[BCI]], [[Falabella]]) y [[Fuentes_de_Datos]] (agregadores evaluados y descartados).
- `decisiones/` — ADRs:

| ADR | Tema | Estado |
|---|---|---|
| [[ADR-001_SQS_Entre_Webhook_Y_Extraccion]] | Cola entre webhook y extracción | retirada |
| [[ADR-002_Datos_Reales_Antes_Del_Webhook]] | Datos reales por sondeo | retirada |
| [[ADR-003_Scraper_Open_Banking_Chile]] | Scraper de la banca en línea como única fuente | vigente |
| [[ADR-005_Publicacion_Supabase]] | Publicación de la bodega en Supabase | vigente |
| [[ADR-006_Alertas_Presupuesto]] | Alertas y plan de ajuste | vistas vigentes, pantallas reemplazadas |
| [[ADR-007_Caja_Por_Ciclo]] | Caja por ciclo de sueldo | vigente |
| [[ADR-008_Salir_De_Deudas]] | Simulador de deudas | reemplazada por ADR-009 |
| [[ADR-009_Mes_Y_Carro]] | Pantalla Mes y carro de compras | vigente |
| [[ADR-010_Hogar_Compartido]] | Hogar compartido | vigente |
| [[ADR-011_Actualizacion_Y_Contabilidad]] | Botón actualizar, agente en el equipo y contabilidad | vigente |

No hay ADR-004: el número quedó sin usar.
