#!/bin/sh
set -e

echo "Backend host: $BACKEND_HOST"
echo "--- resolv.conf ---"
cat /etc/resolv.conf
echo "---"

# Resolve backend IP at startup
# Try nslookup (busybox), then getent, then ping as fallback
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

# Render nginx config
envsubst '${BACKEND_ADDR}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Configure basic auth
if [ -n "$AUTH_USER" ] && [ -n "$AUTH_PASS" ]; then
  htpasswd -bc /etc/nginx/.htpasswd "$AUTH_USER" "$AUTH_PASS"
  echo "Auth configured for: $AUTH_USER"
else
  echo "WARNING: AUTH_USER/AUTH_PASS not set - running without auth"
  sed -i 's/auth_basic "Finance";/auth_basic off;/g' /etc/nginx/conf.d/default.conf
  sed -i '/auth_basic_user_file/d' /etc/nginx/conf.d/default.conf
fi

# Write debug info (auth-protected by nginx)
echo "BACKEND_HOST=$BACKEND_HOST" > /usr/share/nginx/html/debug-dns.txt
echo "BACKEND_ADDR=$BACKEND_ADDR" >> /usr/share/nginx/html/debug-dns.txt
echo "--- resolv.conf ---" >> /usr/share/nginx/html/debug-dns.txt
cat /etc/resolv.conf >> /usr/share/nginx/html/debug-dns.txt
echo "--- rendered nginx config ---" >> /usr/share/nginx/html/debug-dns.txt
cat /etc/nginx/conf.d/default.conf >> /usr/share/nginx/html/debug-dns.txt

exec nginx -g "daemon off;"
