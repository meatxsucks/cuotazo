# ADR-003 — Scraper open-banking-chile como fuente de bancos y tarjetas

**Estado:** aceptada · **Fecha:** 2026-09-28

## Contexto

Ningún agregador accesible para personas cubre Banco Falabella ni tarjetas de crédito (Fintoc, Emisso,
Prometeo, Floid y Penso revisados en [[Fuentes_de_Datos]]). La librería `kaihv/open-banking-chile` (MIT)
cubre Falabella, Santander y BCI, incluidas tarjetas con cuotas.

## Decisión

- `extractores/bancos/extraer.mjs` corre la librería en el Mac y escribe el resultado en
  `fpc-raw/scraper/<banco>/usuario=<id>/fecha_carga=AAAA-MM-DD/`.
- Versión fijada al commit `085faaf`, revisado: solo se conecta a dominios de bancos.
- Correcciones propias con `patch-package` (`extractores/bancos/patches/`): campo de RUT `#document` de
  Falabella y cierre de `#modal-message`, registrando su texto.
- RUT y claves bancarias en el Llavero de macOS (servicio `fpc`), nunca en `.env`, que vive en OneDrive.
- Si el banco rechaza las credenciales, el extractor crea `~/.fpc/bloqueos/<banco>` y no reintenta hasta
  que se borre, para no bloquear la clave.
- Fintoc quedó como respaldo para Santander y BCI y se retiró el 2026-09-30: el scraper cubre todo y Fintoc no se usaba.

## Alternativas

- Solo Fintoc: sin Falabella ni tarjetas.
- Agregadores B2B: exigen empresa.
- Solo estados de cuenta PDF: mensual.

## Consecuencias

- Se rompe cuando un banco cambia su sitio; cada ruptura se corrige con un parche.
- No resuelve clave dinámica.
- Los movimientos no traen ID: la deduplicación en analytics usa fecha, glosa, monto, cuota y tarjeta.
- Corre en el Mac (necesita Chrome), no en una Lambda de floci.
