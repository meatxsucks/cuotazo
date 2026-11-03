# ADR-012 — MCP para el agente: lectura y escritura acotada

**Estado:** aceptada · **Fecha:** 2026-11-03

## Contexto

El agente personal (Orion) necesita leer las finanzas y, con límites, anotar cosas que la app ya sabe guardar (gastos
sueltos, sobres) más ingresos variables, que hoy no tienen dónde registrarse. La app corre en Vercel y los datos en Neon.
El análisis y las alertas los hace el propio agente con las herramientas de lectura: no se construyen aquí.

La base se protege con RLS por `auth.uid()`, pero el agente no tiene sesión de navegador y un JWT de Neon Auth dura 15
minutos. Un token permanente con permiso de escritura es el riesgo principal de esta decisión.

## Decisión

### Dos credenciales, dos roles de base

- **Lectura**: token `Bearer` cuyo SHA-256 está en `AGENTE_TOKEN_SHA256`; el endpoint `/mcp` lee con el rol `agente_mcp`,
  que solo ejecuta `finanzas.agente_leer` (vistas permitidas y siempre filtradas por usuario).
- **Escritura**: un segundo token (`AGENTE_ESCRITURA_SHA256`) y un segundo rol, `agente_mcp_escritura`, que solo ejecuta las
  funciones `finanzas.agente_*` de escritura. `tools/list` muestra las herramientas que escriben únicamente con ese token.
  Orion usa el de lectura por defecto; el de escritura se le entrega cuando se quiere que anote.
- Cada token vive en el Llavero y su hash en Vercel; rotarlo es cambiar el hash.

### Herramientas que escriben (una función `security definer` por operación)

| Herramienta | Efecto | Topes dentro de la función |
|---|---|---|
| `anotar_gasto` | inserta en `anotacion` con `origen = 'agente'` | monto 1 a 500.000, nota ≤ 140, fecha de los últimos 60 días |
| `crear_sobre` | inserta en `sobre` con `origen = 'agente'` | monto ≤ 2.000.000, nombre ≤ 40, máximo 20 sobres creados por el agente |
| `registrar_ingreso` | inserta en la tabla nueva `ingreso` | monto 1 a 5.000.000, fecha de los últimos 60 días |
| `deshacer` | borra una anotación o ingreso del agente, o desactiva un sobre del agente | solo filas con `origen = 'agente'` de los últimos 7 días |

- No hay herramientas para editar ni borrar datos de la persona ni de los bancos.
- Los topes se validan en la base, no solo en el endpoint: aunque el endpoint tuviera un error, la función rechaza.
- Límite de ritmo: 30 escrituras por hora, contadas desde `agente_log`.

### Auditoría

- `finanzas.agente_log` registra cada escritura (herramienta, argumentos, resultado y hora). La persona lo puede leer; el
  agente no.
- La columna `origen` (`app` o `agente`) en `anotacion`, `sobre` e `ingreso` permite distinguir y deshacer lo que anotó.

### Lectura nueva

- `anotaciones` (por rango de fechas) para comparar lo anotado contra el disponible de cada sobre.

## Opciones consideradas

| Opción | Veredicto |
|---|---|
| Un solo token con lectura y escritura | Descartada: una filtración da escritura permanente |
| Escribir con el JWT de Neon Auth | Descartada: el agente guardaría un refresh token con acceso total (editar y borrar todo) |
| Cola de aprobación: el agente propone y la persona confirma en la app | Se deja para después y para montos altos; agrega pantalla y fricción |
| **Dos tokens, dos roles, funciones con topes y auditoría** | **Elegida** |

## Consecuencias

- Orion puede anotar gastos, crear sobres y registrar ingresos sin poder tocar nada de lo existente.
- Un token de escritura filtrado permite anotar datos falsos hasta el límite de ritmo; se revierte con `deshacer`, borrando
  por `origen`, y se corta rotando el hash.
- Dos tokens y dos roles que mantener.
- Los ingresos del agente quedan en `ingreso` pero Mes y Contabilidad todavía no los suman: sale de `resultado_mensual`,
  que viene de los movimientos del banco. Falta ese paso en la app.
- A revisar: aprobación de la persona para montos altos y un tope diario por monto.
