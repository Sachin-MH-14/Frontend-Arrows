#!/bin/sh
set -e

mkdir -p /etc/nginx/snippets

if [ -f /etc/arrows/env.prod ]; then
  tr -d '\r' < /etc/arrows/env.prod > /tmp/env.prod
  set -a
  # shellcheck disable=SC1091
  . /tmp/env.prod
  set +a
fi

export SUPERSET_UPSTREAM="${VITE_SUPERSET_URL:-http://172.174.201.208:8088}"
export BACKEND_UPSTREAM="${VITE_BACKEND_URL:-http://172.174.201.208:5000}"

envsubst '${SUPERSET_UPSTREAM} ${BACKEND_UPSTREAM}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

if [ -n "${SUPERSET_SESSION_COOKIE}" ]; then
  printf '%s\n' "proxy_set_header Cookie \"session=${SUPERSET_SESSION_COOKIE}\";" \
    > /etc/nginx/snippets/superset-cookie.conf
else
  printf '%s\n' '# SUPERSET_SESSION_COOKIE not set' > /etc/nginx/snippets/superset-cookie.conf
fi

node /app/scripts/superset-guest-token-server.mjs &

exec nginx -g 'daemon off;'
