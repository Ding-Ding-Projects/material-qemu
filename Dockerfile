FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends qemu-system-x86 qemu-system-arm qemu-utils qemu-efi-aarch64 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV DATA_DIR=/data BIND_ADDRESS=0.0.0.0 PORT=8080 PUBLIC_ORIGIN=http://localhost:8080
EXPOSE 8080
CMD ["node", "server/index.mjs"]
