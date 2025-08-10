#!/bin/sh

# Replace environment variables in nginx config
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/nginx.conf > /etc/nginx/conf.d/default.conf

# Create a config.js file with environment variables for the frontend
cat > /usr/share/nginx/html/config.js << EOF
window.REACT_APP_BACKEND_URL = "${BACKEND_URL}";
EOF

exit 0
