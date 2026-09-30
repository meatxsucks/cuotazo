# ADR-002 — Datos reales por sondeo antes del webhook

**Estado:** retirada el 2026-09-30: Fintoc salió del proyecto y los datos vienen solo del scraping ([[ADR-003_Scraper_Open_Banking_Chile]]) · **Fecha:** 2026-09-28

## Contexto

El plan original terminaba todo el flujo en modo de pruebas antes de conectar bancos reales. Se prefiere
ver cuanto antes los movimientos propios. Recibir webhooks en local exige abrir un túnel público.

## Decisión

1. **Paso A:** links creados desde el dashboard de Fintoc (sin programar el widget), token guardado en
   Secrets Manager (`fpc/usuarios/<usuario_id>/links/<banco>`) y Lambda `fpc-extractor-movimientos`
   disparada cada 15 minutos por EventBridge Scheduler, que escribe en raw.
2. **Paso B:** webhook con API Gateway, validación de firma y SQS ([[ADR-001_SQS_Entre_Webhook_Y_Extraccion]]),
   probado con eventos del CLI de Fintoc antes de abrir el túnel.

Cada link se prueba primero con un link de modo test y después con el real.

## Alternativas

- Todo en modo de pruebas primero: más seguro, pero posterga ver datos propios.
- Webhook con túnel desde el inicio: expone la máquina antes de tener la firma validada.

## Consecuencias

- La frescura queda limitada por el sondeo (15 min) y por la frecuencia de actualización del plan de Fintoc.
- El extractor pide con 3 días de solape; raw puede tener movimientos repetidos y la deduplicación por
  `id` de Fintoc se hace en analytics.
- Los link tokens reales quedan en el almacenamiento de floci (`~/.fpc/floci-data`), fuera de OneDrive, sin cifrado adicional.
