# ============================================================
# Backend (Express + Socket.IO) imajı
# ============================================================
FROM node:20-alpine

WORKDIR /app

# Bağımlılıklar (yalnızca üretim)
COPY package*.json ./
RUN npm install --omit=dev

# Uygulama kodu
COPY . .

# Ürün görsellerinin yükleneceği dizin (compose'ta volume ile kalıcı yapılır)
RUN mkdir -p uploads/products

ENV NODE_ENV=production
EXPOSE 4091

CMD ["node", "server.js"]
