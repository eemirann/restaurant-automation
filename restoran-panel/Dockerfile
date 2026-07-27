# ============================================================
# Panel (React + Vite) — çok aşamalı: build + nginx ile servis
# ============================================================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# VITE_API_URL BUILD anında gömülür — compose'tan build arg ile geçilir.
ARG VITE_API_URL=http://localhost:4091/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
