#!/bin/sh
set -e

# 1. Render nginx config from template (substitute BACKEND_HOST)
envsubst '${BACKEND_HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# 2. Configure basic auth
if [ -n "$AUTH_USER" ] && [ -n "$AUTH_PASS" ]; then
  htpasswd -bc /etc/nginx/.htpasswd "$AUTH_USER" "$AUTH_PASS"
  echo "Auth configured for: $AUTH_USER"
else
  # Dev mode — disable auth
  echo "WARNING: AUTH_USER/AUTH_PASS not set — running without auth (dev only)"
  sed -i 's/auth_basic "Finance";/auth_basic off;/g' /etc/nginx/conf.d/default.conf
  sed -i '/auth_basic_user_file/d' /etc/nginx/conf.d/default.conf
fi

# 3. Start nginx
exec nginx -g "daemon off;"
