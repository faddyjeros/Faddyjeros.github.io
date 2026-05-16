#!/bin/sh
set -e

# Read ALL nameservers from the container runtime
NAMESERVERS=$(awk '/^nameserver/{printf "%s ", $2}' /etc/resolv.conf)
if [ -z "$NAMESERVERS" ]; then
  NAMESERVERS="127.0.0.11"
fi
export NAMESERVERS
echo "DNS resolvers: $NAMESERVERS"
echo "Backend host: $BACKEND_HOST"

# Render nginx config
envsubst '${BACKEND_HOST} ${NAMESERVERS}' \
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
echo "NAMESERVERS=$NAMESERVERS" > /usr/share/nginx/html/debug-dns.txt
echo "BACKEND_HOST=$BACKEND_HOST" >> /usr/share/nginx/html/debug-dns.txt
echo "--- resolv.conf ---" >> /usr/share/nginx/html/debug-dns.txt
cat /etc/resolv.conf >> /usr/share/nginx/html/debug-dns.txt
echo "--- rendered nginx config ---" >> /usr/share/nginx/html/debug-dns.txt
cat /etc/nginx/conf.d/default.conf >> /usr/share/nginx/html/debug-dns.txt

exec nginx -g "daemon off;"
