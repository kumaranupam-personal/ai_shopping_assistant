# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# The frontend image (docs/13-deployment.md): the production build, served by nginx as a non-root user on port 8080.

FROM node:24-slim AS build
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
# The build calls the API on its own origin (an empty VITE_API_BASE_URL); the server's reverse proxy sends /api/ to
# the API container. The Turnstile site key is public, not a secret, hence the skipped lint check above.
ARG VITE_TURNSTILE_SITE_KEY=
RUN VITE_API_BASE_URL= VITE_TURNSTILE_SITE_KEY="$VITE_TURNSTILE_SITE_KEY" npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /frontend/dist /usr/share/nginx/html
EXPOSE 8080
