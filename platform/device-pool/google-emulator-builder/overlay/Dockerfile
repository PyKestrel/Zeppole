# Zeppole overlay: Appium + noVNC (adb screencap stream) on Google aemu images.
ARG GOOGLE_BASE_IMAGE
FROM ${GOOGLE_BASE_IMAGE}

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates python3 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g appium@2 \
    && (appium driver install uiautomator2 || true) \
    && rm -rf /var/lib/apt/lists/*

COPY zeppole-entrypoint.sh /usr/local/bin/zeppole-entrypoint.sh
COPY display-http.py /usr/local/bin/display-http.py
RUN chmod +x /usr/local/bin/zeppole-entrypoint.sh

EXPOSE 6080 4723 5555 8554 5554

ENTRYPOINT ["/usr/local/bin/zeppole-entrypoint.sh"]
