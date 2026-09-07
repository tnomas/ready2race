# syntax=docker/dockerfile:1.7
#
# Web-Image in zwei Stufen: Node baut das Frontend, nginx liefert es aus und
# reicht /api und /static (samt Websockets) an das Backend weiter. Nach außen
# gibt es damit genau einen HTTP-Port, den ein Reverse-Proxy mit TLS versorgt.

FROM node:22-alpine AS build

WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Die Adressen sind relativ, weil nginx Frontend und API unter derselben
# Herkunft ausliefert. Wer das Backend woanders betreibt, überschreibt sie beim
# Bau (docker compose build --build-arg VITE_API_BASE_URL=https://...).
ARG VITE_API_BASE_URL=/api
ARG VITE_THEME_URL=/static/theme.json
ARG VITE_FONTS_URL=/static/fonts
ARG VITE_LOGOS_URL=/static/logos
ARG VITE_R2R_LOGO_URL=/r2r_logo.png
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_THEME_URL=$VITE_THEME_URL \
    VITE_FONTS_URL=$VITE_FONTS_URL \
    VITE_LOGOS_URL=$VITE_LOGOS_URL \
    VITE_R2R_LOGO_URL=$VITE_R2R_LOGO_URL

RUN npm run build


FROM nginx:1.27-alpine AS runtime

# Das nginx-Image setzt beim Start Umgebungsvariablen in allen Vorlagen unter
# /etc/nginx/templates ein und legt das Ergebnis nach /etc/nginx/conf.d.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /build/dist /usr/share/nginx/html

ENV BACKEND_UPSTREAM=backend:8080

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ > /dev/null || exit 1
