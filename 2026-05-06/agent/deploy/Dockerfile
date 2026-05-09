FROM node:20-alpine

RUN apk add --no-cache python3
WORKDIR /app

COPY package.json ./
COPY apps ./apps
COPY scripts ./scripts
COPY workflows ./workflows
COPY data ./data

EXPOSE 4173
CMD ["node", "apps/api/server.js"]
