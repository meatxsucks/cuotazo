# ADR-001 — SQS entre el webhook y la extracción

**Estado:** retirada el 2026-09-30: Fintoc salió del proyecto y los datos vienen solo del scraping ([[ADR-003_Scraper_Open_Banking_Chile]]) · **Fecha:** 2026-09-28

## Contexto

El evento `account.refresh_intent.succeeded` de Fintoc trae un conteo de movimientos nuevos, no los
movimientos. Hay que responder rápido al webhook y después pedir los movimientos a la API.

## Decisión

La Lambda `receptor_webhook` valida la firma, guarda el evento en raw y encola un mensaje por cuenta en
SQS. La Lambda `extractor_movimientos` consume la cola y escribe los movimientos en raw.

## Alternativas

- Kinesis: pensado para flujos de alto volumen con varios consumidores; aquí son pocos eventos al día y
  un solo consumidor. Reintentar un registro fallido bloquea el shard.
- Llamar a la API dentro del webhook: si Fintoc tarda o falla, el webhook expira y Fintoc reintenta.

## Consecuencias

- Reintento por mensaje y cola de fallidos para lo que no se pudo extraer.
- El extractor debe ser idempotente: Fintoc puede entregar el mismo evento más de una vez.
