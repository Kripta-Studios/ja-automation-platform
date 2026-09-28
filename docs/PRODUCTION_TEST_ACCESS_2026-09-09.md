# Production role-test access — 2026-09-09

Six operator-requested portal accounts were provisioned on the existing production runtime
`58403295db6c0ba585eaf2e873437044cb065e24`: Finance Admin, Project Manager, standard Worker,
Auditor read-only, Supplier Coordinator and External Technician. All are active and have local
portal credentials. No additional Owner account was created. Credential values and the private
account inventory are deliberately excluded from Git.

Provisioning was rehearsed against an isolated copy of a fresh backup before a transaction was
applied to production. Each new identity has a reviewed `user.bootstrap` audit event. Normal
domain operations created the test client, internal installation `TEST — Role access installation`
(`C-0029-P-001`), supplier, project-manager/worker assignments, coordinator grant and external
technician assignment. This is explicitly test data, not verified fiscal configuration; no actual
hours, invoices, payments or compensation amounts were fabricated.

All six accounts passed real browser sign-in, role identity, an authorized page and relevant
HTTP 403 boundary checks against the public production portal. The coordinator sees the add-technician
form and the assigned external technician. Supplier and external-technician access to Finance and
My Pay is denied. The Worker and Project Manager see the dedicated test installation. The Owner's
user row and credential hashes match the pre-provisioning backup. SQLite integrity and foreign-key
checks pass. Backup snapshots were taken before and after account creation.

## Client-address correction found during verification

Repeated test logins exposed that the Node adapter lacked its trusted-proxy address configuration.
It therefore grouped public logins under the container-side address, potentially sharing the
application's authentication attempt limit across users. Production now sets `ADDRESS_HEADER=X-Forwarded-For`
and `XFF_DEPTH=1` in its private environment file. The portal was recreated with its existing image;
the public hostname points directly to this server and Caddy is the single trusted reverse proxy.
The backend port remains bound to loopback. No global authentication threshold or stored counter
was reduced or cleared.

Two real successful sign-ins through Caddy, with different deliberately supplied forwarded-address
headers, produced one new public-client bucket whose count advanced from one to two. They did not
reuse the former shared container-address bucket, and forged header values did not split the bucket.
The production health/jobs verifier passed after activation. Preserve these two environment settings
when maintaining this single-proxy topology; reassess the trusted chain if another proxy is added.

Private operator evidence is retained on the VPS under `/var/lib/jaautomation-operator-evidence/`.
The account creation took effect immediately in production; application source and PDF bytes are
unchanged by this provisioning operation.
