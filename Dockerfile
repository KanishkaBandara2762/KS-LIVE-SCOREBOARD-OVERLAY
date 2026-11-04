FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ ./

RUN mkdir -p uploads/logos && chmod -R 777 uploads

EXPOSE 3001

CMD ["node", "server.js"]
