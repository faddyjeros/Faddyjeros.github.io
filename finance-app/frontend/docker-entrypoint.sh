#!/bin/sh
set -e

echo "Backend host: $BACKEND_HOST"
echo "--- resolv.conf ---"
cat /etc/resolv.conf
echo "---"

# Resolve backend IP at startup
BACKEND_IP=$(nslookup "$BACKEND_HOST" 2>/dev/null | awk '/^Address: / && !/127\.0\.0/ { print $2; exit }')
if [ -z "$BACKEND_IP" ]; then
  BACKEND_IP=$(getent hosts "$BACKEND_HOST" 2>/dev/null | awk '{print $1}' | head -1)
fi
if [ -n "$BACKEND_IP" ]; then
  echo "Resolved $BACKEND_HOST -> $BACKEND_IP"
  export BACKEND_ADDR="$BACKEND_IP"
else
  echo "WARNING: Could not resolve $BACKEND_HOST, using name directly"
  export BACKEND_ADDR="$BACKEND_HOST"
fi

# Render nginx config — substitute both BACKEND_ADDR and BACKEND_HOST
envsubst '${BACKEND_ADDR} ${BACKEND_HOST}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "--- rendered nginx config ---"
cat /etc/nginx/conf.d/default.conf
echo "---"

# Configure basic auth
if [ -n "$AUTH_USER" ] && [ -n "$AUTH_PASS" ]; then
  htpasswd -bc /etc/nginx/.htpasswd "$AUTH_USER" "$AUTH_PASS"
  echo "Auth configured for: $AUTH_USER"
else
  echo "WARNING: AUTH_USER/AUTH_PASS not set - running without auth"
  sed -i 's/auth_basic "Finance";/auth_basic off;/g' /etc/nginx/conf.d/default.conf
  sed -i '/auth_basic_user_file/d' /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"
