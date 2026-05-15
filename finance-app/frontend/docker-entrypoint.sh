#!/bin/sh
set -e

# Read the container's own DNS resolver (knows about internal Container Apps services)
NAMESERVER=$(grep '^nameserver' /etc/resolv.conf | head -1 | awk '{print $2}')
if [ -z "$NAMESERVER" ]; then
  NAMESERVER="127.0.0.11"
fi
export NAMESERVER
echo "DNS resolver: $NAMESERVER"
echo "Backend host: $BACKEND_HOST"

# Render nginx config
envsubst '${BACKEND_HOST} ${NAMESERVER}' \
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

# Write resolv.conf to a debug file (auth-protected by nginx)
echo "NAMESERVER=$NAMESERVER" > /usr/share/nginx/html/debug-dns.txt
echo "BACKEND_HOST=$BACKEND_HOST" >> /usr/share/nginx/html/debug-dns.txt
cat /etc/resolv.conf >> /usr/share/nginx/html/debug-dns.txt

exec nginx -g "daemon off;"
