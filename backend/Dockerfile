FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Ensure uploads directory exists and is writable
RUN mkdir -p uploads/logos && chmod -R 777 uploads

EXPOSE 3001

CMD ["node", "server.js"]
