# ============================================================
# Müşteri QR Menüsü (React + Vite) — çok aşamalı: build + nginx ile servis
# ============================================================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# VITE_API_URL BUILD anında gömülür. VARSAYILAN BİLEREK BOŞTUR: boş
# olduğunda menü API'yi GÖRELİ '/api' adresinden çağırır ve nginx bunu
# backend'e proxy'ler (bkz. nginx.conf ve src/api/client.js). Böylece aynı
# imaj hem yerel IP hem Cloudflare Tunnel alan adı üzerinden çalışır —
# offline/USB kurulumda imajlar hazır geldiği için bu ŞART.
# Buraya mutlak bir adres gömmek, imajı tek bir adrese kilitler.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
