# Protocolo de trabajo

## Al iniciar

1. Leer [[README]] y esta nota.
2. Revisar [[TODO]] para ubicar la fase en curso.
3. Revisar [[DUDAS]] por si la tarea depende de una decisión abierta.

## Durante

- Cada cambio aplicado se registra en [[CHANGELOG]] en cuanto queda aplicado.
- Una decisión de arquitectura nueva genera un ADR en `decisiones/`.
- Lo detectado y no hecho va a [[TODO]] cuando se detecta.

## Reglas

- Todo en español.
- No commit ni push sin pedido explícito. Commits sin firmas ni atribuciones automáticas.
- Nada se ejecuta contra AWS real: todo apunta a floci (`http://localhost:4566`).
- Credenciales y claves solo en `.env` y Secrets Manager, nunca en el repo, el vault ni S3.
- Ningún dato bancario real dentro del repo ni de carpetas sincronizadas.
- El repo es público: `spec/` y el código van sin nombres, RUT, correos, montos reales, comercios de compras reales,
  terminaciones de tarjetas o cuentas, refs de proyectos en la nube ni notas personales. El detalle personal va a
  `spec/privado/` (ignorado por git) y en la nota pública queda la versión genérica con su valor técnico.
- No decir "funciona" sin haberlo corrido; cada fase tiene su criterio de término en [[TODO]].
- Comentarios de código pocos y como etiqueta; docstrings de una frase; SQL sin comentarios.
