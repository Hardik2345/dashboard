FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY migrations ./migrations

ENV NODE_ENV=production
ENV PORT=4030

EXPOSE 4030

CMD ["node", "src/server.js"]
