FROM ja-automation-portal:dw-runtime-base-1491b4b38944
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends --no-upgrade poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa tesseract-ocr-por util-linux \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /app \
 && mkdir /app \
 && chown 10001:10001 /app
WORKDIR /app
COPY --chown=10001:10001 app/ /app/
ENV NODE_ENV=production PORT=5100 HOST=127.0.0.1 JA_REPORTING_LOGO_PATH=/app/reporting-assets/logo-jaautomation.png JA_MANUAL_ROOT=/app/manuals
USER 10001:10001
EXPOSE 5100
CMD ["node", "build"]
