#!/usr/bin/env bash
set -euo pipefail

BASE="$HOME/Área de trabalho/Hermes Agent/dash-externo"
LOG_DIR="$BASE/logs"
mkdir -p "$LOG_DIR"

start() {
  echo "=== SxConnect Stack ==="

  # 1) WhatsApp painel (obrigatório)
  if ! ss -ltnp | grep -q ':8080'; then
    echo "[1/3] Subindo WhatsApp painel (8080)..."
    cd "$BASE/whatsapp-painel/painel-whats-main" && \
      nohup .venv/bin/uvicorn server.dev:app --host 127.0.0.1 --port 8080 > "$LOG_DIR/whatsapp-8080.log" 2>&1 &
    sleep 2
  else
    echo "[1/3] WhatsApp painel já ativo (8080)"
  fi

  # 2) wa-contacts-server (Kambam -> BD) com auto-respawn
  if ! ss -ltnp | grep -q ':9002'; then
    echo "[2/3] Subindo wa-contacts (9002)..."
    ( cd "$BASE" && while true; do echo "[9002] iniciando"; python3 wa-contacts-server.py >> "$LOG_DIR/wa-contacts-9002.log" 2>&1 || true; echo "[9002] caiu, aguardando 2s"; sleep 2; done ) &
    sleep 1
  else
    echo "[2/3] wa-contacts já ativo (9002)"
  fi

  # 3) Painel principal (SxConnect)
  if ! ss -ltnp | grep -q ':9000'; then
    echo "[3/3] Subindo painel principal (9000)..."
    cd "$BASE" && nohup python3 -m http.server 9000 --bind 127.0.0.1 > "$LOG_DIR/sxconnect-9000.log" 2>&1 &
    sleep 1
  else
    echo "[3/3] Painel principal já ativo (9000)"
  fi

  echo "=== Stack pronta ==="
}

status() {
  echo "=== Status ==="
  for port in 8080 9000 9002; do
    if ss -ltnp | grep -q ":$port"; then
      echo "porta $port: ATIVA"
    else
      echo "porta $port: INATIVA"
    fi
  done
}

logs() {
  local port="$1"
  local f="$LOG_DIR/sxconnect-9000.log"
  if [ "$port" = "8080" ]; then
    f="$LOG_DIR/whatsapp-8080.log"
  elif [ "$port" = "9002" ]; then
    f="$LOG_DIR/wa-contacts-9002.log"
  fi
  echo "=== Logs $port ==="
  tail -n 80 "$f"
}

stop() {
  echo "=== Parando ==="
  pkill -f "python3 -m http.server 9000" || true
  pkill -f "python3 wa-contacts-server.py" || true
  pkill -f "uvicorn server.dev:app --host 127.0.0.1 --port 8080" || true
  sleep 1
  echo "Parado."
}

case "${1:-start}" in
  start) start ;;
  status) status ;;
  logs) logs "${2:-9000}" ;;
  stop) stop ;;
  *) echo "Uso: $0 {start|status|logs <porta>|stop}" ; exit 1 ;;
esac
