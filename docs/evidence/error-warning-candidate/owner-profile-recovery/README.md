# Owner profile email recovery

Disposable candidate browser QA on 2026-09-26 at phone 390×844 and desktop 1440×900: **2/2 active cases passed** (two other-project cases intentionally skipped). The Owner opened an existing worker profile and entered an HTML-valid email longer than the repository's 254-character limit. The attempted save returned typed HTTP 400 `ACCESS_WORKER_EMAIL_INVALID`.

At both widths, the Spanish cause and correction remedy appeared, the editor reopened with entered name/email/role intact even when a saved directory search, status filter, and page would hide the worker; its focused validation summary was fully inside the viewport. The target worker record remained byte-for-byte unchanged across name, email, role, and update timestamp; no browser runtime errors occurred.

The first diagnostic exposed a real native-reload scroll reset: the summary had focus at y≈7339 in an 844px phone viewport while window scroll was zero. The shared UI fix centers an offscreen focused summary; the final 2/2 run above used the fixed candidate. The two PNGs crop only the synthetic ProblemNotice, and the JSON summaries omit the entered email, worker ID, credentials, raw response, and trace. Release commit: pending.
