FROM ja-automation-portal:digital-workers-2d7b76a250f6
USER root
RUN rm -rf /app/build /app/src /app/.svelte-kit /app/manuals
COPY --chown=10001:10001 build/ /app/build/
COPY --chown=10001:10001 src/ /app/src/
COPY --chown=10001:10001 .svelte-kit/ /app/.svelte-kit/
COPY --chown=10001:10001 manuals/ /app/manuals/
COPY --chown=10001:10001 runtime-content-manifest.json /app/runtime-content-manifest.json
LABEL org.opencontainers.image.revision="848c07f20efc08a0b07e2ea23bb393b7d25392f0"
USER 10001:10001
