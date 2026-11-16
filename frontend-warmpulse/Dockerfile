FROM node:20-alpine AS build

WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --include=dev

COPY . .
RUN npx tsc -b && npx vite build

FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8088
CMD ["nginx", "-g", "daemon off;"]
