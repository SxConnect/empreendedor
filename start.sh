#!/bin/bash
set -e

cd /app

echo "Starting main panel on 9000..."
uvicorn server:app --host 0.0.0.0 --port 9000 &
PID1=$!

echo "Starting whatsapp panel on 8080..."
cd /app/painel-whats && uvicorn server.dev:app --host 0.0.0.0 --port 8080 &
PID2=$!

wait $PID1 $PID2
