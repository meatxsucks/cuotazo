# Dudas abiertas

| # | Duda | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| 6 | Estados de cuenta disponibles | ¿Qué bancos entregan PDF y cuáles Excel? | Un estado de cuenta de cada tarjeta (con datos tachados) para diseñar los lectores | Fase 5 |
| 7 | Correos de Falabella | ¿Qué correos llegan (compra, pago, cuotas)? ¿Traen número de cuotas? | **Resuelta 2026-09-28:** Falabella no envía correo por compra; solo notificación push de la app, que iOS no deja leer. CMR se ingiere por estado de cuenta PDF y, si existe, exportación Excel de movimientos. Experimento opcional: leer notificaciones duplicadas en el Mac | — |
| 8 | Categorías iniciales | a) catálogo propio corto (~15) · b) estándar tipo Plaid | a), con subcategorías solo donde aporten | Fase 6 |
| 9 | Categorizar con un modelo de lenguaje lo que las reglas no alcanzan | a) no por ahora · b) sí, enviando solo glosa y monto | a): reglas primero; decidir cuando se vea cuánto queda sin categoría | — |
| 10 | Canal de la alerta de flujo negativo | Telegram · correo · solo tablero | Por ahora solo en la app (Resumen y Mes); notificaciones en el backlog | — |
| 11 | Visualización | Streamlit · Metabase | **Resuelta 2026-09-29:** app web propia (SvelteKit en Vercel sobre Supabase), [[APP_WEB]] | — |
| 12 | Repo dentro de una carpeta sincronizada en la nube | a) mover el repo · b) quedarse y dejar los datos de floci en `~/.fpc/` | **Resuelta 2026-09-28:** el código puede estar sincronizado; los datos de floci van a `~/.fpc/floci-data`, fuera de la sincronización | — |

Las dudas 1 a 5 (Fintoc, webhook y link tokens) se cerraron el 2026-09-30 al retirar Fintoc ([[ADR-003_Scraper_Open_Banking_Chile]]).
