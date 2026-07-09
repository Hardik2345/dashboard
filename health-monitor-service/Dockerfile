FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV HEALTH_MONITOR_PORT=4015

EXPOSE 4015

CMD ["node", "src/server.js"]
