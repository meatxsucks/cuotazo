# Fuentes de datos

Revisado el 2026-09-28 contra la documentación de Fintoc (versión de API `v2026-02-01`).

> Fintoc se evaluó y se retiró del proyecto el 2026-09-30: todos los datos vienen del scraping de la banca en
> línea ([[ADR-003_Scraper_Open_Banking_Chile]]). Esta nota queda como registro de por qué no sirve para personas.

## Fintoc (evaluado y descartado)

### Qué se verificó

| Pregunta | Respuesta | Fuente |
|---|---|---|
| ¿Cubre Santander? | Sí, personas (`cl_banco_santander`): cuenta corriente y cuenta vista, CLP, 24 meses de historia | Products and Institutions |
| ¿Cubre BCI? | Sí, personas (`cl_banco_bci`): cuenta corriente y cuenta vista, CLP, 12 meses | Products and Institutions |
| ¿Cubre Banco Falabella? | **No.** No aparece en la lista de bancos del módulo de movimientos | Products and Institutions |
| ¿Entrega tarjetas de crédito? | **No, según la tabla de cobertura:** para todos los bancos solo aparecen cuentas corrientes y cuentas vista. Banco de Chile y Scotiabank piden un permiso de "línea de crédito", pero no hay productos de tarjeta | Products and Institutions |
| ¿Cada cuánto actualiza? | Actualización periódica según el plan contratado; algunos planes permiten pedir una actualización a demanda (Refresh Intent) | Overview, Refreshing on demand |
| Refresh Intent | Tarda 1 a 3 minutos; hay que esperar 5 minutos entre intentos; si el banco pide segundo factor hay que abrir el widget | Refresh Intents |
| Webhooks | Eventos firmados con `Fintoc-Signature` (HMAC SHA-256); reintentos, así que puede haber entregas duplicadas; los eventos perdidos se recuperan con la API de eventos | Webhooks overview |
| Eventos de actualización | `account.refresh_intent.succeeded` (trae `new_movements`, no los movimientos), `account.refresh_intent.failed`, `account.refresh_intent.rejected` (credenciales inválidas) | Refresh Intents webhook |
| Otros eventos | La documentación menciona avisos cuando el titular cambia su clave (ya no se pueden traer movimientos) y cuando un movimiento desaparece del banco (cheque protestado). **Nombres exactos sin verificar** | Webhooks overview |
| Modo de pruebas | Claves `sk_test_`/`pk_test_`; objetos `Link` y `Movement` simulados; no permite conectar cuentas reales. Usuarios de prueba para personas: `41614850-3`, `40427672-7`, `41579263-8`, clave `jonsnow` | Test mode, Test your integration |
| Webhooks en local | El CLI de Fintoc reenvía webhooks y dispara eventos de prueba hacia una máquina local | Fintoc CLI |
| Límites | 100 solicitudes/s por organización; 100 conexiones del widget cada 130 s; ante 429, backoff exponencial 1-2-4-8-16 s | API rate limits |
| Link token | Representa las credenciales del banco. Fintoc **no lo guarda**: si se pierde, hay que reconectar | Create a banking Link |

### Observado con el link real (2026-09-28)

- El dashboard permitió crear un link real de Santander para persona sin pedir contratación.
- `next_refresh` queda una hora después de la última actualización: actualización periódica cada hora.
- El link token solo funciona con la clave de su modo: con la clave de pruebas responde 403 `invalid_link_token`.

### Qué no se pudo verificar

- **Si una persona natural puede contratar Fintoc y cuánto cuesta.** El sitio se presenta como plataforma para empresas y los precios públicos son solo del medio de pago (1% + IVA). Los precios de movimientos no están publicados: hay que crear cuenta en el dashboard o preguntar a ventas.
- La lista completa de tipos de evento y los valores posibles de `account.type` (la página de referencia no se pudo leer en esta sesión).

### Movimiento de ejemplo

`id`, `amount` (con signo), `currency`, `post_date`, `transaction_date`, `description`, `type`
(`transfer`, …), `pending`, `sender_account`/`recipient_account` (RUT, nombre, número, banco),
`comment`, `reference_id`.

## Respaldo

| Fuente | Qué cubre | Riesgo |
|---|---|---|
| ~~Correos de compra de Falabella en Gmail~~ | Descartado 2026-09-28: Falabella no envía correo por compra, solo notificación push de la app (iPhone, no legible desde otra app) | — |
| ~~Emisso Connect~~ | Descartado 2026-09-28: su catálogo (consultado por MCP) solo tiene portales de empresas (BancoEstado, Security, Banco de Chile, BCI, BICE, Itaú y Santander Empresas), SII, Previred, Mercado Público e indicadores. Sin Banco Falabella ni banca de personas. Solo Banco de Chile Empresas trae movimientos de tarjetas | — |
| ~~Prometeo, Floid~~ | Registro con correo corporativo; orientados a empresas | — |
| ~~Penso~~ (penso.money), descartado 2026-09-28 por el usuario tras probarlo | App chilena gratuita; dice sincronizar automáticamente Banco Falabella (CMR con cuotas), Itaú, Banco de Chile y Security, e importar cartolas PDF. MCP oficial en `https://app.penso.money/api/mcp` con OAuth 2.1 (scopes `penso:read`, `penso:write`, `offline_access`) | Hay que entregarle a Penso las credenciales de Banco Falabella; empresa pequeña; sin API documentada fuera del MCP. Sin verificar con datos reales |
| **open-banking-chile** (`github.com/kaihv/open-banking-chile`, MIT, TypeScript, ~210★), candidato | Scrapers con navegador (Playwright/Puppeteer) que corren en local con RUT y clave. Falabella marcado funcional: cuenta y CMR con movimientos no facturados y facturados, cuotas (`installments`), monto total de la compra, cupos, fechas de facturación y vencimiento, último estado de cuenta y pago mínimo. También cubre Santander y BCI | Se rompe cuando el banco cambia su web; si el banco pide clave dinámica, falla (no resuelve 2FA); la clave del banco queda en local; movimientos sin ID propio (deduplicar por fecha, glosa, monto y cuota). Revisado el código el 2026-09-28: solo se conecta a dominios de bancos, sin telemetría ni envío a terceros. Sin probar con datos reales |
| Exportación Excel de movimientos CMR (por confirmar) | Compras CMR a demanda, sin esperar el cierre | Carga manual |
| Estados de cuenta PDF/Excel | Tarjetas CMR, Santander y BCI: cuotas vigentes, intereses, comisiones, pagos | Carga manual y mensual; el PDF de CMR viene con clave |

Consecuencia: **todo lo de tarjetas de crédito (cuotas, intereses, comisiones, compras CMR) depende del respaldo**, no de Fintoc. Fintoc aporta cuentas corrientes y vista de Santander y BCI, donde se ven sueldo, gastos con débito, transferencias y pagos de tarjeta.
