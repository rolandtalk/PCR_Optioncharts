# Playwright image includes Node.js + Chromium for scraping (use tag that exists on MCR)
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000
ENV PORT=3000
ENV RAILWAY=1

CMD ["node", "server.js"]
