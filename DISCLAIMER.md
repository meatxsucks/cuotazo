# Aviso

Cuotazo es un proyecto personal y educativo. Antes de usarlo, ten en cuenta:

- **Uso personal con tus propias credenciales.** Está hecho para que cada persona lea sus propias cuentas,
  en su propio equipo. No lo uses con credenciales de terceros ni para ofrecer un servicio a otras personas.
- **Términos de cada banco.** Automatizar el acceso a la banca en línea puede ir contra los términos y
  condiciones de tu banco. Revísalos: la responsabilidad de usarlo es tuya.
- **Solo lectura.** Los extractores solo leen saldos, movimientos, estados de cuenta y créditos. No hacen
  transferencias, pagos ni cambios de configuración, y no deben modificarse para hacerlo.
- **Riesgo de bloqueo.** Varios intentos fallidos pueden bloquear tu clave. El extractor se detiene ante el
  primer rechazo (`~/.fpc/bloqueos/<banco>`), pero no puede evitar todos los casos.
- **Sin garantías.** Los montos, categorías, proyecciones y alertas pueden estar incompletos o equivocados
  cuando un banco cambia su sitio. No es asesoría financiera. El software se entrega "tal cual", según la
  [licencia MIT](LICENSE).
- **Sin relación con los bancos.** Santander, BCI, Banco Falabella, CMR y demás marcas pertenecen a sus
  dueños; este proyecto no está afiliado ni respaldado por ninguno de ellos.

## Créditos

Los extractores usan [`kaihv/open-banking-chile`](https://github.com/kaihv/open-banking-chile) (licencia MIT),
fijado a un commit revisado y con parches propios en `extractores/bancos/patches/` (aplicados con
`patch-package`). Gracias a sus autores por publicarlo.
