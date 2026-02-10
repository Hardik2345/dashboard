FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci \
  && npm run build --if-present \
  && npm prune --omit=dev \
  && apk del .build-deps

COPY . .

ENV NODE_ENV=production
EXPOSE 3006

CMD ["node", "server.js"]
