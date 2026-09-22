# Portal proxy mitigation — 2026-09-22

The initial committed release `eb80da46db921d42893eeeb0b91f828357f5c5fd` deployed successfully at 10:31:37 UTC. A fresh browser check then reproduced an EOF/502 for GET `/j-aautomation/app/login` at 10:32:43.207 UTC (11.565 seconds). The portal completed synchronous readiness at 10:32:43.204 UTC after 13.427 seconds. Container restart count was zero, with no OOM. The failed browser run is retained in `browser-initial-failure.log`.

Mitigation: disable upstream HTTP keep-alive on the six portal routes in `deployment/Caddyfile.snippet`. This avoids reusing pooled Node sockets when readiness delays its event loop. Socket reuse is a plausible mechanism, not a conclusively established root cause. No write retries, route changes, authentication changes or body-limit changes are introduced. Website and mail upstreams are unchanged. The tradeoff is extra localhost TCP connections. Browser-to-Caddy keep-alive is unaffected.

Caddy documentation: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#the-http-transport

Validation: full Caddy configuration validates; adapted installed JSON matches the previous JSON exactly after removing only the new transport property from 12 portal proxy handlers (six routes imported for two hosts). Reload succeeded. Independent read-only reviewer `/root/visual_review` found no blocking configuration concern. Six public browser pages passed after reload. Nine login requests across three concurrent readiness cycles and six-second idle intervals returned HTTP 200; details in `proxy-concurrency.json`.

Limit: this does not remove synchronous readiness latency. Some concurrent login requests took about 2.3 seconds. Future monitoring should distinguish proxy failures from readiness delays. Passing this sample does not guarantee that every future request will succeed.
