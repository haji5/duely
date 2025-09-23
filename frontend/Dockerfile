# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_API_URL

# Set environment variables from build args (do NOT set NODE_ENV before installing dev deps)
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID \
    VITE_API_URL=$VITE_API_URL

# Copy lockfiles for deterministic installs
COPY package.json package-lock.json ./

# Install dependencies including devDependencies (tsc lives here)
RUN npm ci --silent --no-audit --no-fund && npm cache clean --force

# Copy source code
COPY . .

# Build the application (VITE_* envs are inlined now)
RUN npm run build

# Runtime stage
FROM nginx:alpine

WORKDIR /

# Copy build artifacts
COPY --from=build /app/build /usr/share/nginx/html
# Copy hardened Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Ensure nginx user can read/write necessary dirs and drop privileges
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx
USER nginx

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
