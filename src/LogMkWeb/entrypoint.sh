#!/bin/sh

# Define an array with key-value pairs
vars="
API_URL:$API_URL
AUTH_ID:$AUTH_ID
AUTH_DOMAIN:$AUTH_DOMAIN
AUTH_REDIRECT:$AUTH_REDIRECT
AUTH_AUDIENCE:$AUTH_AUDIENCE
"

# Directory containing the JS files
directory='/usr/share/nginx/html'

# Loop over the array and replace each placeholder with its corresponding env var
echo "$vars" | while IFS=: read -r key value; do
    # Escape forward slashes in the value
    escaped_value=$(printf '%s\n' "$value" | sed 's/[\/&]/\\&/g')
    find "$directory" -name '*.js' -exec sed -i -e "s,\${$key},$escaped_value,g" {} \;
done

echo "API_URL: $API_URL"
echo "AUTH_ID: $AUTH_ID"
echo "AUTH_DOMAIN: $AUTH_DOMAIN"
echo "AUTH_REDIRECT: $AUTH_REDIRECT"
echo "AUTH_AUDIENCE: $AUTH_AUDIENCE"

# Start Nginx
nginx -g 'daemon off;'