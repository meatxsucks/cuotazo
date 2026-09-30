# Web — Finanzas Personales Chile

App SvelteKit 2 (Svelte 5) que muestra las tablas del esquema `finanzas` de Supabase definidas en
`spec/CONTRATO_PRESENTACION.md`: caja y tarjetas, consumo del mes, diario, categorías, alertas de presupuesto, plan de ajuste, deudas, salir de deudas, pagos fijos, anotador de compras con sobres y movimientos.

Las tablas y vistas de la migración 0003 (caja, pagos fijos, deudas manuales, sobres) son opcionales: si faltan, cada pantalla lo avisa y el resto sigue funcionando. `npx vitest run` corre las pruebas del simulador de deudas (ADR-008).

## Modo demostración

Sin `PUBLIC_SUPABASE_URL` ni `PUBLIC_SUPABASE_ANON_KEY` la app usa datos sintéticos (`src/lib/demo/`) y no pide login.
Las alertas, el perfil, los pagos fijos, las deudas anotadas, los sobres y las compras anotadas editados en demo viven en memoria del servidor y se pierden al reiniciarlo;
las vistas de alertas y plan se replican en `src/lib/demo/calculos.ts` con las mismas fórmulas que la migración 0002.

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # svelte-check
npm run build && npm run preview
```

## Conectar Supabase

1. Copia `.env.example` a `.env` y completa `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` (clave anónima, nunca la service key).
2. En Supabase: exponer el esquema `finanzas` en *Settings → API → Exposed schemas*; RLS activo en todas las tablas.
3. En *Authentication → URL Configuration* agrega `https://<tu-dominio>/auth/confirmar` (y `http://localhost:5173/auth/confirmar`) como Redirect URL.
4. El login es por enlace mágico. Un usuario sin fila en `finanzas.usuario` con su `auth_user_id` ve un aviso de "sin datos vinculados".

Toda la lectura pasa por `src/lib/datos/` (`FuenteDatos`), con implementación Supabase y demo; las consultas corren en el servidor con la sesión del usuario (cookies vía `@supabase/ssr`).

## Desplegar en Vercel

- Importa el repo y define **Root Directory = `web`** (framework SvelteKit, se detecta solo; adapter `@sveltejs/adapter-vercel`, runtime Node 22).
- Variables de entorno: `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Sin ellas el despliegue queda en modo demostración.
