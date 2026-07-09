#!/bin/sh
set -eu

register_url="${HEALTH_MONITOR_REGISTER_URL:-http://health-monitor-service:4015/register}"

(
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if wget -q -O /dev/null http://127.0.0.1:18080/health; then
      break
    fi
    sleep 1
  done

  payload='{"serviceName":"api-gateway","baseUrl":"http://api-gateway:18080","healthEndpoint":"/health","dependencies":["auth_service"],"endpoints":[{"path":"/health","method":"GET","critical":true,"intervalSeconds":30,"expectedStatus":200},{"path":"/health/monitor","method":"GET","critical":true,"intervalSeconds":60,"expectedStatus":200}]}'

  if ! curl -fsS -H "Content-Type: application/json" -X POST "$register_url" -d "$payload" >/tmp/health-monitor-register.log 2>&1; then
    echo "[health-monitor] api-gateway registration skipped: $(cat /tmp/health-monitor-register.log 2>/dev/null || true)"
  else
    echo "[health-monitor] api-gateway registration complete"
  fi
)&

exec openresty -g 'daemon off;'
