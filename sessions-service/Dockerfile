FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY src ./src

# Default environment variables
ENV NODE_ENV=production
ENV PORT=4010

EXPOSE 4010

CMD ["node", "src/server.js"]
