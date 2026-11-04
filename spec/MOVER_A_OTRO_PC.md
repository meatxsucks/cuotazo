# Mover Cuotazo a otro PC (CachyOS)

Lo que viaja: el código (carpeta `cuotazo/`), y el estado cifrado `cuotazo-estado.tar.gz.enc` (datos crudos de bancos, `.env`, claves). Las claves **nunca** van en git ni a la nube.

## En el Mac (origen)
1. `cd ~/cuotazo && scripts/exportar_estado.sh /Volumes/COS_202608/cuotazo-traslado` (genera la frase en ~/cuotazo-frase.txt; cópiala a mano o por foto, no al pendrive).
2. Antes de apagar: pausa el agente (`scripts/instalar_actualizacion.sh --quitar`) para que no corran dos máquinas a la vez contra Neon.

## En CachyOS
1. Copia `cuotazo-traslado/cuotazo.tar.gz` y descomprímelo: `tar xzf cuotazo.tar.gz -C ~` (queda `~/cuotazo`).
2. `cd ~/cuotazo && scripts/montar_linux.sh /ruta/cuotazo-estado.tar.gz.enc` (instala Docker, Node, Python, Chromium, restaura datos y claves, levanta floci).
3. Cierra sesión y vuelve a entrar (grupo `docker`), repite el paso 2 si se cortó.
4. Verifica la bodega: `PATH=$PWD/scripts/linux:$PATH bash scripts/cargar_bodega.sh` debe terminar con `cuadraturas OK: True`.
5. Publica: `aws lambda invoke --function-name fpc-publicar-supabase /tmp/p.json` (con `AWS_ENDPOINT_URL=http://localhost:4570`). Debe mostrar conteos, sin `FunctionError`.
6. Si falla con timeout a la bodega: el secreto `fpc/bodega` debe apuntar a la IP actual del contenedor floci (`docker inspect fpc-floci`), puerto 7001 por dentro.
7. `scripts/instalar_actualizacion.sh` (crea el timer de systemd, cada minuto; corrida diaria desde las 7:00).

## Reglas
- Solo una máquina activa a la vez; la publicación reemplaza lo de Neon.
- Los bancos pueden pedir verificación extra desde un equipo nuevo: la primera extracción hazla a mano y atento al celular (Santander Pass).
- Sin Cisco/VPN corporativa activa: Falabella no abre.

## No probado en Linux
Los scripts de `scripts/linux/`, `scripts/systemd/` y `montar_linux.sh` se escribieron sin ejecutarse en CachyOS. El paso de Terraform con floci restaurado es el más frágil: si choca, se resuelve en el sitio.
