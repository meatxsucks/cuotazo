#!/usr/bin/env bash
# Instala en macOS el agente que atiende el botón "Actualizar" de la app y corre la actualización diaria.
# Uso: scripts/instalar_actualizacion.sh [--quitar]
set -euo pipefail

cd "$(dirname "$0")/.."
ETIQUETA=cl.cuotazo.actualizacion
DESTINO="$HOME/Library/LaunchAgents/$ETIQUETA.plist"

launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
if [[ "${1:-}" == "--quitar" ]]; then
  rm -f "$DESTINO"
  echo "agente quitado"
  exit 0
fi

mkdir -p "$HOME/.fpc/logs" "$HOME/Library/LaunchAgents"
sed -e "s#__RAIZ__#$(pwd)#g" -e "s#__HOME__#$HOME#g" scripts/launchd/$ETIQUETA.plist > "$DESTINO"
launchctl bootstrap "gui/$(id -u)" "$DESTINO"
echo "agente instalado: revisa cada minuto si la app pidió actualizar y corre una vez al día desde las 7:00"
echo "log: $HOME/.fpc/logs/actualizacion.log"
