FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
COPY scripts/requirements.txt ./scripts/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r scripts/requirements.txt

COPY apps ./apps
COPY scripts ./scripts
COPY data ./data

ENV PYTHON_BIN=python3
ENV HOST=0.0.0.0

EXPOSE 4173
CMD ["node", "apps/api/server.js"]
