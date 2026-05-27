FROM node:22-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/NetrisTV/ws-scrcpy.git /src
WORKDIR /src
RUN printf '%s\n' '{"INCLUDE_GOOG":true,"USE_WEBCODECS":true,"USE_H264_CONVERTER":true}' > build.config.override.json
RUN npm install && npm run dist

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
