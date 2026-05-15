#!/bin/sh
set -e

# 1. Read the container's DNS resolver from /etc/resolv.conf
NAMESERVER=$(grep '^nameserver' /etc/resolv.conf | head -1 | awk '{print $2}')
if [ -z "$NAMESERVER" ]; then
  NAMESERVER="127.0.0.11"
fi
export NAMESERVER
echo "Using DNS resolver: $NAMESERVER"

# 2. Render nginx config (substitute BACKEND_HOST and NAMESERVER)
envsubst '${BACKEND_HOST} ${NAMESERVER}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# 3. Configure basic auth
if [ -n "$AUTH_USER" ] && [ -n "$AUTH_PASS" ]; then
  htpasswd -bc /etc/nginx/.htpasswd "$AUTH_USER" "$AUTH_PASS"
  echo "Auth configured for: $AUTH_USER"
else
  echo "WARNING: AUTH_USER/AUTH_PASS not set - running without auth (dev only)"
  sed -i 's/auth_basic "Finance";/auth_basic off;/g' /etc/nginx/conf.d/default.conf
  sed -i '/auth_basic_user_file/d' /etc/nginx/conf.d/default.conf
fi

# 4. Start nginx
exec nginx -g "daemon off;"
