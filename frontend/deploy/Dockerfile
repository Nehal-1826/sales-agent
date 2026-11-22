# Frontend — build with Vite, serve with nginx (build context: frontend/)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY scripts/prerender.mjs ./scripts/prerender.mjs
ARG VITE_PUBLIC_SITE_URL=https://warmpulse.tech
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL
# Firebase web config (public by design; kept out of git via build args —
# the repo has push protection on AIza* keys)
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_FIREBASE_STORAGE_BUCKET=
ARG VITE_FIREBASE_SENDER_ID=
ARG VITE_FIREBASE_APP_ID=
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_SENDER_ID=$VITE_FIREBASE_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
