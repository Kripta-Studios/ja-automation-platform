# Production boot outage — 2026-09-10

The VPS booted at 08:30 CEST. The installed jaautomation.service ran Docker
Compose with `--build` and reached its 180-second startup timeout at 08:33:33.
At incident inspection only the jobs container existed; the site and portal
upstreams were absent, causing Caddy to return 502. The old unit also used
`down` on service stop, removing containers instead of preserving them.
The reason for the VPS reboot has not been established.

At 10:19 CEST the site and portal were started from the current release's local
image tags without rebuilding. Public website and login returned HTTP 200
(following the website's trailing-slash redirect). Both containers were healthy.
The boot build had updated those tags; this was not an immutable-image rollback.
No database migration or application source change was performed in recovery.

The canonical and installed systemd unit now explicitly select the deployment
project and environment file, use `up -d --no-build --pull never`, and use `stop`
instead of `down`. Image builds remain a deployment operation, not a boot step.
The updated unit passed systemd-analyze verify and was enabled and started
successfully against the recovered containers. The production verification
script passed website, portal and jobs checks. A whole-VPS reboot was not used
as a test because unrelated services share the host.

This is a host service correction; the active application release remains
58403295db6c0ba585eaf2e873437044cb065e24. Previous contractual acceptance gaps
are not closed by this availability fix.
