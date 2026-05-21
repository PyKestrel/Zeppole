FROM python:3.12-bookworm AS py
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io git ca-certificates openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/google/android-emulator-container-scripts.git /opt/aemu \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip setuptools \
    && /opt/venv/bin/pip install -e /opt/aemu

FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY catalog.json ./
RUN npm install && npm run build

# Final image needs Node (HTTP API) and Python venv (emu-docker) plus Docker CLI.
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io git ca-certificates openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*
COPY --from=py /opt/aemu /opt/aemu
COPY --from=py /opt/venv /opt/venv
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/catalog.json /app/catalog.json
COPY overlay /opt/zeppole-overlay
COPY scripts/run-build.sh /opt/zeppole-scripts/run-build.sh
RUN chmod +x /opt/zeppole-scripts/run-build.sh

ENV PATH="/opt/venv/bin:${PATH}"
ENV DOCKER_BUILDKIT=1
WORKDIR /work
VOLUME ["/work"]
EXPOSE 9200
CMD ["node", "/app/dist/server.js"]
