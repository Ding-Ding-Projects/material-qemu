FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
RUN apt-get update && apt-get install -y --no-install-recommends qemu-system-x86 qemu-system-arm qemu-utils qemu-efi-aarch64 qemu-efi-arm ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
ARG BUILD_DATE
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
LABEL org.opencontainers.image.created=$BUILD_DATE
COPY server ./server
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV DATA_DIR=/data BIND_ADDRESS=0.0.0.0 PORT=8080 PUBLIC_ORIGIN=http://localhost:8080
ENV BUILD_DATE=$BUILD_DATE SOURCE_REVISION=$SOURCE_REVISION
EXPOSE 8080
CMD ["node", "server/index.mjs"]
