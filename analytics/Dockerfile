FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci \
  && npm run build --if-present \
  && npm prune --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++

COPY . .

ENV NODE_ENV=production
EXPOSE 3006

CMD ["node", "server.js"]
