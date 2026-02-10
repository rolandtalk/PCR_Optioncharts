# Playwright Node image includes Chromium for scraping
FROM mcr.microsoft.com/playwright/node:v1.49.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000
ENV PORT=3000
ENV RAILWAY=1

CMD ["node", "server.js"]
