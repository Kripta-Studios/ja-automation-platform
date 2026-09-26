# Wave 8 notification recovery browser evidence

- Frozen production build SHA-256: `19bf019faec1e178ad365d3d081123442fa2dedd4a86fb343998a83259783748`; HEAD at freeze: `dbe849956c150c76dbea0898de1605e3daaf1006`. QA spec SHA-256: `e25e030d3078d2ee417a25d29ff30dcee25d035bc5add3382ec8489e134f2520`.
- **2/2 passed** on fresh disposable databases: 390 px English and 1440 px Portuguese. Native invalid link returned HTTP 400 `NOTIFICATION_INVALID_LINK`; native deleted-after-open returned HTTP 404 `NOTIFICATION_UNAVAILABLE`. Both focused the problem notice, showed the inbox remedy, preserved the unread filter and scroll, and never exposed another user's record. Enhanced mark-read succeeded and removed the item from unread. A cross-user enhanced request returned HTTP 200 transport with typed 404 `NOTIFICATION_UNAVAILABLE`. No unexpected page or console errors.
- The sanitized network files include `/api/offline/identity` HTTP 503 from the disabled offline identity endpoint; those responses are unrelated to notification actions. Screenshots contain only the notice. JSON contains action codes, scroll positions, and HTTP status/path, with IDs, credentials, query strings, request bodies, and raw browser traces excluded.

| Viewport | Screenshot SHA-256 | Trace SHA-256 | Network SHA-256 |
| --- | --- | --- | --- |
| 390 px English | `10feca158e803bf578bba694e3463d22d8bdd4c6f6da8bd74c4f5ddec21f9a2c` | `6d2f28dc1661a707933c320b39fec8e96abe1537f96e46297744a4f9529f5e3c` | `dd0f4f15554040154141e22100dc77b50956042237dfff928aef68232d12ff5b` |
| 1440 px Portuguese | `0064e561ad6992971687e7a6d13698d809d863d41e455d18f00afc966f95e98f` | `0d745e821953d88fcfa06717f8613a810ae296b0d35cbd269416531c9526f77b` | `dd0f4f15554040154141e22100dc77b50956042237dfff928aef68232d12ff5b` |
