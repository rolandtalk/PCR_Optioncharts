FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000
ENV PORT=3000
ENV RAILWAY=1

CMD ["node", "server.js"]
