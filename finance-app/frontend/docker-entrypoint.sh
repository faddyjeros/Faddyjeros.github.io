#!/bin/sh
set -e

# Render nginx config (substitute BACKEND_HOST only; resolver is hardcoded)
envsubst '${BACKEND_HOST}' \
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

exec nginx -g "daemon off;"
