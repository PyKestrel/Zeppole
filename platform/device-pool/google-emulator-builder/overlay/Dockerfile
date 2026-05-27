# Minimal Zeppole overlay: boot helper only (display via ws-scrcpy sidecar at deploy time).
ARG GOOGLE_BASE_IMAGE
FROM ${GOOGLE_BASE_IMAGE}

USER root

COPY zeppole-entrypoint.sh /usr/local/bin/zeppole-entrypoint.sh
RUN chmod +x /usr/local/bin/zeppole-entrypoint.sh

EXPOSE 5555 8554 5554

ENTRYPOINT ["/usr/local/bin/zeppole-entrypoint.sh"]
