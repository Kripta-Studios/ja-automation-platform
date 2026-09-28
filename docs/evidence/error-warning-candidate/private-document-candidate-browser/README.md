# Private document browser recovery

Candidate product build: `8b16ce8` (built 2026-09-27 after the mobile focus fix). Chromium used a disposable SQLite fixture and synthetic `text/plain` private documents uploaded through the Owner interface. Finance viewed and downloaded the file; Worker was denied. The browser tests passed at 390 × 844 and 1440 × 900. No production data or private document content is in this packet.

| Case | 390 px | 1440 px |
| --- | --- | --- |
| Owner upload of synthetic finance-class document | Success through the real form | Success through the real form |
| Signed-out GET | Real HTTP 401 `DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED` | Real HTTP 401 `DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED` |
| Worker GET for Owner's document | Real HTTP 404 `DOCUMENT_DOWNLOAD_UNAVAILABLE`; file absent from Worker list | Same |
| Finance View | Real HTTP 200, `text/plain`, inline disposition, blob preview | Same |
| Finance Download | Real HTTP 200, attachment disposition, expected synthetic filename | Same |
| Missing storage file after authorization | Real HTTP 409 `DOCUMENT_DOWNLOAD_FILE_MISSING`; focused inline explanation and contact-owner remedy; file restored afterward | Covered at 390 px |
| Session/access/service failures | Browser-intercepted typed 401/404/503 displayed inline; correct remedy and focused alert. EN and PT checked. | Browser-intercepted typed 503 displayed inline in ES; focused alert. |
| Browser blocks preview popup | Focused `DOCUMENT_PREVIEW_POPUP_BLOCKED`; Download offered; **zero document GETs** | Covered at 390 px |

On failed View, the provisional preview tab closed and no raw JSON tab remained. The Documents URL and filtered record remained in place; the checked scroll movement was under 500 px. The focused 390 px notices sat at least 8 px above fixed mobile navigation after the fix. No horizontal overflow, page exceptions, or unexpected console errors occurred. Browser resource errors caused by deliberately intercepted failure statuses were excluded from the unexpected-console count. The 503 cases were injected into browser requests; they are not evidence of a naturally failing storage service.

The first phone run exposed a focus visibility defect: fixed mobile navigation covered the bottom of the explanation and remedy. Product commit `8b16ce8` corrected the scroll clearance. The phone rerun passed an explicit notice-above-navigation assertion and produced the two clear 390 px screenshots below. The desktop ES case was rerun against the same build. The later optional `ProblemNotice` locale prop commit `d7bd827` was not in this build and was not required for this Documents flow.

Only cropped `ProblemNotice` elements were saved; the screenshots contain no filename, user, account, project, document ID, file bytes, or session value. Successful browser traces were not retained because sign-in traces can include disposable credentials. [Redacted action and network summary](observations.json) records the asserted route states without URLs or IDs.

| Cropped screenshot | SHA-256 |
| --- | --- |
| `finance-en-390-409.png` | `65c80adb9717d671cfa3f317f34c7c97a70411d1a6b4d122734b3ad43e4006c1` |
| `finance-pt-390-503.png` | `2ec07013250a208c7c38d1f97d65402ce6b118909470d1ba77a9481fac8fd4b4` |
| `finance-es-1440-503.png` | `a0eddbe41e0746d972ed0807dfcb021b38e4e8037d5f352f4771f51dae2a112b` |
