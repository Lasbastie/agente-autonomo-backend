#!/bin/bash
set -e
echo "=== Instalando Evolution API no VPS ==="
apt-get update -y
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
mkdir -p /opt/evolution
cd /opt/evolution
cat > docker-compose.yml << 'COMPOSEEOF'
version: '3.8'
services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://147.93.39.48:8080
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=agentecreator123
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
      - QRCODE_LIMIT=30
      - DEL_INSTANCE=false
      - DATABASE_ENABLED=false
      - REDIS_ENABLED=false
      - LOG_LEVEL=ERROR
    volumes:
      - evolution_store:/evolution/store
      - evolution_instances:/evolution/instances
volumes:
  evolution_store:
  evolution_instances:
COMPOSEEOF
docker compose up -d
sleep 15
curl -s http://localhost:8080
echo ""
echo "=== PRONTO! http://147.93.39.48:8080 ==="
