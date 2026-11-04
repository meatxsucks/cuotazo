#!/usr/bin/env bash
# Instala en macOS el agente que atiende el botón "Actualizar" de la app y corre la actualización diaria.
# Uso: scripts/instalar_actualizacion.sh [--quitar]
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ "$(uname)" == "Linux" ]]; then
  D="$HOME/.config/systemd/user"
  if [[ "${1:-}" == "--quitar" ]]; then systemctl --user disable --now cuotazo-actualizacion.timer; rm -f "$D"/cuotazo-actualizacion.*; echo "agente quitado"; exit 0; fi
  mkdir -p "$D" "$HOME/.fpc/logs"
  for u in service timer; do sed "s#__RAIZ__#$(pwd)#g" scripts/systemd/cuotazo-actualizacion.$u > "$D/cuotazo-actualizacion.$u"; done
  systemctl --user daemon-reload && systemctl --user enable --now cuotazo-actualizacion.timer
  echo "timer instalado (cada minuto); log: journalctl --user -u cuotazo-actualizacion"
  exit 0
fi
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
