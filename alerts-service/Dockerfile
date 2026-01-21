FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build --if-present
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 5005

CMD ["node", "app.js"]
