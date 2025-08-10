# Stage 1: Build the React application
FROM node:18-alpine AS builder
ARG REACT_APP_BACKEND_URL

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the backend URL environment variable
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN echo "Using backend URL: $REACT_APP_BACKEND_URL"

# Build the application
RUN npm run build

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the built static assets from the builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Create a custom nginx configuration that handles React router
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Create a simple health check file
RUN echo "OK" > /usr/share/nginx/html/health

# Expose port 80
EXPOSE 80

# Use CMD instead of relying on the parent image's ENTRYPOINT
CMD ["nginx", "-g", "daemon off;"]