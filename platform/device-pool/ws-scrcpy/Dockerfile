FROM node:22-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/NetrisTV/ws-scrcpy.git /src
WORKDIR /src
RUN printf '%s\n' '{"INCLUDE_GOOG":true,"USE_WEBCODECS":true,"USE_H264_CONVERTER":true}' > build.config.override.json
RUN npm install && npm run dist
# dist/ ships its own generated package.json with runtime deps (express, ws,
# node-pty, adbkit...). Install them here where build tools exist (node-pty is
# native); without this, `node index.js` dies instantly with MODULE_NOT_FOUND.
WORKDIR /src/dist
RUN npm install --omit=dev --omit=optional

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    android-tools-adb ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/dist /app/dist
COPY config.yaml entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh
ENV WS_SCRCPY_CONFIG=/app/config.yaml
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
