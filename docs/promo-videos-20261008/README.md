# Product trailers, 8 October 2026

Two 1080p30 trailers of the portal that is serving `https://j-aautomation.com/j-aautomation/app`. Both are 3 minutes. The last 47 seconds, from 1:30, show four roles on the demo project: a worker filing an expense and opening My Pay, a crew chief with eight hours recorded for each of two technicians and a receipt ready to split, Finance reading invoiced against unbilled work, and an external technician logging hours on the same project. They were recorded against that live portal, composited on this VPS, and published as static files in front of the app. The app process, the database, and every other Caddy site were left on their existing routes.

| Cut | Page | File on disk |
|---|---|---|
| Video 1, J&A | https://j-aautomation.com/j-aautomation/app/video | `/var/www/ja-promo-video/ja-automation-trailer-1080p30.mp4` |
| Video 2, Evocon | https://j-aautomation.com/j-aautomation/app/video2 | `/var/www/ja-promo-video2/evocon-industrial-operations-1080p30.mp4` |

Both cuts tell the same sales story and use the same sharp, full-frame picture. Video 1 keeps the J&A name, the J&A logo, the red lighting and `j-aautomation.com` on the end card. Video 2 is the Evocon Solutions cut of that same film: Evocon wordmark, orange and purple, and `alvaro.schwiedop@evocon-solutions.com` on the end card. Video 2 is the one intended for Antonny, so he can show other companies what Evocon built for J&A.

This folder is the reproducible source. It does not contain the rendered videos, the captured frames, the soundtrack wav, login sessions, or any password. Those stayed on the VPS. See [What is not in git](#what-is-not-in-git).

## What the films actually argue

An earlier cut of Video 1 closed on a count of capabilities, tasks, roles and languages. Those inventories overlap, so adding 237 + 120 does not produce 357 separate features. That cut was replaced. The file now at `/j-aautomation/app/video` is the differentiator cut.

Both films argue the thing that is hard to assemble in Harvest, Jobber, Odoo or Dynamics 365 Project Operations: one traceable path from a person, through the hours they actually worked, through a commercial agreement that can be hourly, daily or weekly, to an invoice that does not bill the same day or week twice.

The shot that carries this is a real draft already in the demo project `C-0050-P-20261005` (invoice `01a10cb5-ec04-7109-af1a-c49ae34b0116`):

| Line | Quantity | Price | Amount |
|---|---:|---:|---:|
| Persona 1, part 1 | 1.50 h | $80 | $120 |
| Persona 1, part 2 | 0.50 h | $80 | $40 |
| Persona 2, part 1, full unit rate (day) | 1.00 day | $600 | $600 |
| Persona 2, part 2, unit already covered (day) | 0.00 day | $600 | $0 |
| Persona 3, part 1, full unit rate (week) | 1.00 week | $1,500 | $1,500 |
| Persona 3, part 2, unit already covered (week) | 0.00 week | $1,500 | $0 |
| Total | 2.00 h · 1.00 day · 1.00 week | | $2,260 |

The invoice also prints "Actual recorded time: 7.50 h". The caption on that shot is "Hourly, daily and weekly" / "7.5 hours worked. One day and one week, each billed once. Three agreements, one invoice."

The other captions were rewritten to match what that frame can defend:

- Economics: contribution is not cash. Invoiced, unbilled, cost and contribution stay separate.
- Approvals: operations confirms the facts. Finance decides the treatment. Customer acceptance is of a specific version.
- PLC report: problem, diagnosis, change, validation and rollback, kept with the project.
- Planning: a chief can record the crew, and each person keeps their own hours, pay and customer terms.
- Phone: a published plan never becomes actual hours.
- Closing card, four lines: per-person commercial terms, expenses with separate meanings, crews that stay individual, evidence tied to the invoice.

The expense sentence is true of Commercial Configuration (who paid, whether the worker is reimbursed, and whether the customer is charged are separate). That screen is an admin form covered by review warnings, so it is stated on the closing card and not given its own shot.

Bank account, SWIFT and beneficiary lines on every invoice frame are blurred in the page before the frame is captured. The Owner email is blurred on the sign-in shot. The Owner name remains visible in the app header, because that is the real session.

## Technologies

| Piece | What it was |
|---|---|
| Browser automation | Playwright 1.63.0, loaded from the already-cached npx tree `/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`. No fresh browser download. |
| Browser | The Chromium build already in `/root/.cache/ms-playwright/chromium-1234`. Playwright 1.63 wanted `chromium_headless_shell-1243`, which was not installed, so every launch passes `executablePath` to the 1234 binary. |
| Node | v24.5.0, the Cursor agent Node at `/root/.local/share/cursor-agent/versions/2026.10.01-e373342/node`. |
| Capture | Chrome DevTools Protocol `Page.startScreencast`, JPEG quality 92, acknowledged on every frame. A 1px opacity tick every 33ms forces frames while the page is idle, because screencast only emits on repaint. |
| Desktop picture | CSS viewport 1440×810 with `--force-device-scale-factor=1.3333333`, which is what actually made the screencast come out 1920×1080. Setting `deviceScaleFactor` in Playwright alone still produced 1440×810 frames. |
| Phone picture | CSS viewport 400×860, `--force-device-scale-factor=2.5`, frames 1000×2150, drawn inside a CSS phone. |
| Cursor | An init script injects a fixed-position SVG pointer that follows `mousemove`, plus a red ring on `mousedown`. On the phone profile the pointer is a translucent circle. |
| Compositor | `compose.html` + `compose.js`. Headless Chromium opens the file at 1920×1080 and calls `renderFrame(t)` once per frame. Titles, captions, the phone, the role grid and the window around the recording are DOM, not ffmpeg filters. |
| Encoder | Static ffmpeg 7.0.2 extracted from the `imageio-ffmpeg` 0.6.0 wheel (`libx264`, `aac`). The system had no ffmpeg. The Playwright ffmpeg build only had VP8, so it could not make an H.264 file. |
| Music | `music.py`. Original, synthesized with NumPy 2.4.6 and SciPy 1.17.1. No sample library and no third-party track. 120 BPM, A minor / F / C / G with a lifted B section, extended to 188 seconds so the 3-minute cut still has music under the end card, stereo 44.1 kHz. Sidechain ducking is applied to the music bus only, so the kick is not ducked by itself. |
| Receipt images | Pillow 11.3.0. Three fictitious receipts, each labelled "DEMO RECEIPT - NOT A TAX DOCUMENT". |
| Fonts | Geist and Geist Mono, the woff2 files the portal already serves at `/j-aautomation/app/fonts/`. |
| Evocon mark | `https://evocon-solutions.com/assets/logo-evocon.png`. This VPS could not resolve that host through its own resolver. The address `217.160.0.188` came from DNS-over-HTTPS against `1.1.1.1`, and curl used `--resolve`. Sampled brand colours are orange `rgb(255, 147, 71)` and purple `rgb(82, 70, 104)`. |
| Web server | The system Caddy. Static `file_server`, not the portal. |

## Directories

Work happened in `/srv/mail/ja-promo-video-20261008` because the root filesystem was full (about 400 MB free) when the job started. `/srv/mail` had the free space. A symlink `/home/kripta/ja-promo-video-20261008` points at `out/` so the finished files are easy to find.

```
/srv/mail/ja-promo-video-20261008/
  accounts.json          passwords. mode 0600. not in git.
  state/*.json           Playwright storageState for each role. session cookies. not in git.
  assets/                logo.png, logo-evocon.png, geist woff2, three demo receipts
  tools/ffmpeg           the static 7.0.2 binary
  audio/soundtrack.wav   188 s, 44.1 kHz stereo
  rec/<scene>/frames/    JPEG screencast, about 530 MB for the final takes
  rec/<scene>/index.json frame timestamps and named markers
  shots/                 contact sheets and stills used while judging takes
  out/                   encoded mp4, render logs. intermediate frame sequences were deleted after encode
  pipeline scripts       the files copied into pipeline/ in this folder

/var/www/ja-promo-video/     video 1, poster, geist, index.html
/var/www/ja-promo-video2/    video 2, poster, logo, geist, index.html
/etc/caddy/ja-promo-video.caddy
/etc/caddy/Caddyfile         one added import, inside the j-aautomation.com site only
/etc/caddy/Caddyfile.before-promo-video.<timestamp>   backup taken before that edit
```

## Pipeline

Four stages. Each one is a file in `pipeline/`.

### 1. Record the live app

`rec-lib.mjs` is the shared library: `launch`, `newCtx`, `startRecording`, `keepAlive`, `moveTo`, `clickOn`, `typeSlow`, `smoothScroll`, `settle`. The pointer eases with a cubic curve so the cursor does not jump.

`scene-login.mjs` signs in as Owner and saves `state/owner.json` from that single attempt. Later scenes reuse the saved session and do not sign in again. `login-save.mjs` does the same for the other roles, with a pause between attempts.

`scenes.mjs` records one named scene per invocation: `node scenes.mjs <name> [role]`. The scenes are `dashboard`, `project`, `planning`, `approvals`, `report`, `finance`, `billing`, `audit`, `language`, `mobile`. `scene-units.mjs` is the Video 2 invoice shot.

Every recording writes `rec/<name>/index.json`:

```json
{ "frames": [{ "t": 0.0, "file": "00000.jpg" }], "markers": [{ "name": "submit", "t": 7.96 }], "duration": 21.4 }
```

Markers are wall-clock notes taken while the gesture happens (`rec.mark('lines')`). The timeline uses them only as a human aid. Cuts are declared as recording-time offsets in the timeline, because the screencast clock and the wall clock drift.

`explore.mjs`, `scout.mjs`, `formdump.mjs` and the `peek*.mjs` files were the inspection tools: per-role navigation, page text, and a dump of every visible form field. `roleshots.mjs` took the eight stills used in the role grid. `pagecheck.mjs` and `pagecheck2.mjs` loaded the published pages and read `video.duration`, `videoWidth` and `readyState`.

### 2. Decide the edit

`build_timeline.py` writes Video 1. `build_timeline_v2.py` writes Video 2. Both emit `timeline.json` and `timeline.js`. The committed copies are `timeline-video1.json` and `timeline-video2.json`. `timeline.js` is not committed: it inlines every captured frame name, and it is regenerated from the JSON plus `rec/*/index.json` whenever the compositor runs.

A segment is one of `title`, `scene`, `phone`, `roles`, `stats`. Times are seconds. `remap: [[outputSecond, recordingSecond], ...]` is a piecewise-linear map from time-inside-the-segment to time-inside-the recording, which is how the sign-in shot skips the wait between clicking Continue and the dashboard appearing. `zoom` is `[recordingSecond, scale, centerX, centerY]` in the 1920×1080 frame, eased between keys. `blur` is a rectangle in that same frame, used on the email field.

Video 2 segments set `sharp: true`. The compositor then draws the recording at 1:1 across the whole 1920×1080 frame and skips the browser chrome, the perspective tilt and the 0.94 scale that made Video 1 look soft. Video 1's window was 1600px wide inside a 1920px frame, then scaled again by a CSS transform, then photographed. That is the blur.

`build_timeline.py` also extends each segment by the next segment's fade length, so a crossfade has both pictures alive. `brand: "evocon"` is what makes `compose.js` swap the logo, the orange `#ff9347`, the purple glow and the wider wordmark card.

Both films are 180.0 seconds. Flashes are white frames of half a second at 9s, 28s and 168s, lined up with the impacts in the soundtrack. The role scenes occupy 90s to 137s.

### 3. Render frames

`render.mjs` opens `compose.html`, waits for `document.fonts.ready`, and for `t = i/30` calls `renderFrame` and takes a JPEG screenshot.

`node render.mjs --stills 6.5,33` writes preview JPEGs. `node render.mjs --frames <from> <to> <dir>` writes `00000.jpg` onward and skips files that already exist, so an interrupted render resumes. `node render.mjs out.mp4 <from> <to>` streams JPEGs to ffmpeg. The streaming path stalled on this machine (the encoder was waiting and the log simply stopped). The frame-sequence path did not, so both finished films were encoded from a directory of JPEGs.

Video 1 frames were JPEG quality 95, then `libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p -r 30 -movflags +faststart`, AAC 192 kbps. Result: 1920×1080, 30 fps, 2:13, about 60 MB, video around 3.4 Mbps.

Video 2 frames were JPEG quality 98 and `-crf 16`. The file is smaller, about 46 MB and 2.6 Mbps, because a full-frame UI with little camera movement compresses better than the scaled, tilted window. The picture is sharper because the recording is no longer resampled down and back up.

Audio is `audio/soundtrack.wav`, trimmed to 180 seconds, faded over the last 2 seconds, at `-1 dB`.

### 4. Music

`music.py` is deterministic (`numpy` Generator seed 7). Tempo is 120, so a bar is 2 seconds and the edit can sit on bar boundaries. Sections, in bars: intro 0–4, A 4–20, B 20–36, A2 36–52, break 52–56, drop 56–62, outro 62–66. Pads are detuned saws through a low pass. The arp is one pluck per 16th note. Bass is a sine plus a filtered saw on the chord root. Drums are a pitch-dropped sine kick, a filtered-noise clap and a high-passed hat. A noise riser enters the drop, and an impact marks bars 4, 20, 36, 56 and 62.

## Demo data written while filming

The portal did not have enough recent field activity to carry a trailer. The following was entered through the test accounts, in the project that is already labelled as fictitious: `C-0050-P-20261005`, "BBS · Ejemplo de manual". `BBS Mexico` and `Junkers OHIO` were not touched. They hold real client data and they do not appear in either film.

`seed-lib.mjs` drives the real forms (`createTime`, `createDailyReport`, `createTechnicalReport`, `createExpense`, `submitTimeWeek`, `submitExpenseWeek`, `createPlanning`) and the real Approve buttons. Saves call the button's own click handler, because the floating "Find a task" button covers the submit button at 1440×810.

| Who | What |
|---|---|
| Worker 1 | Time drafts for 6, 7 and 8 October, submitted with the week. Two daily reports (6 and 7 October), submitted. |
| Worker 2 | Time for 6, 7 and 8 October including a travel row, submitted. One daily report for 7 October, submitted. |
| Crew chief | PLC report for the Line 3 case packer (7 October), submitted. Time for 6, 7 and 8 October, submitted. Daily report for 8 October, submitted. Three expenses with the demo receipts (hotel $238, fuel $64.20, meal $42.50), submitted. |
| Project manager | Approved two time rows (both technicians, 6 October) and two reports (Worker 1 daily of 6 October, and the PLC report). Published 15 planning assignments from 9 to 19 October. |
| Owner | The approval scene is a real click. Recording it, including a retake, approved two further demo time rows (Worker 2 and Worker 1, 7 October) under the Owner session. |

The mixed-unit invoice above was already in the project. It was not created for the film.

The language scene switches the Owner interface to Spanish and then Portuguese, and switches it back to English before the script exits.

## Hosting

Caddy matches in source order, and the portal import owns `/j-aautomation/app*`. A static route has to be declared before that import, and it has to be narrower than the app.

`hosting/ja-promo-video.caddy` is the snippet that is installed at `/etc/caddy/ja-promo-video.caddy`. It handles only `/j-aautomation/app/video` and `/j-aautomation/app/video2`, strips that prefix, and serves the matching directory with `file_server`. Range requests work, which is what lets the player seek. `X-Robots-Tag: noindex` is set. Cache is 5 minutes.

The `Caddyfile` change is a single line, inside the `j-aautomation.com` site and above the portal import:

```
import /etc/caddy/ja-promo-video.caddy
```

It was validated with `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` and applied with `systemctl reload caddy`. Caddy was not restarted. The portal deploy script replaces `/etc/caddy/jaautomation.caddy` on every release and does not touch this snippet or this import, so a later app deploy does not remove the videos.

`/j-aautomation/app/video/*` does not match `/j-aautomation/app/video2`, so the two handlers do not shadow each other. A path such as `/j-aautomation/app/videos` still falls through to the portal.

Before and after the reload, the same URLs were checked: the marketing site, the app login, the www and app redirects, gex-dashboard, ogatonegro.com and webmail. Video 1 stayed 200 when Video 2 was added. The only new status was `/app/video2` going from no route to 200.

`hosting/video1-index.html` and `hosting/video2-index.html` are the player pages. Each is a title, a `<video controls playsinline>` with a poster, a download link, and either a link into the workspace (video 1) or the Evocon mailto (video 2).

## How to rebuild

From `/srv/mail/ja-promo-video-20261008`, with `accounts.json` present and the ffmpeg binary at `tools/ffmpeg`:

```sh
python3 music.py
node scene-login.mjs
node scenes.mjs dashboard
node scene-units.mjs
python3 build_timeline_v2.py
node render.mjs --frames 0 133 out/v2frames
tools/ffmpeg -y -framerate 30 -i out/v2frames/%05d.jpg -i audio/soundtrack.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -profile:v high -r 30 -c:a aac -b:a 192k \
  -af "volume=-1dB,afade=t=out:st=131:d=2" -t 133 -movflags +faststart \
  out/evocon-industrial-operations-1080p30.mp4
```

`build_timeline.py` is the Video 1 edit. Re-running the seed scripts creates more drafts. Re-running `scenes.mjs approvals` clicks Approve again.

Sign-in is rate limited at 10 attempts per 15 minutes per client address (`JA_AUTH_RATE_LIMIT_MAX`, default 10, in `apps/portal/src/hooks.server.ts`). The early exploration tripped that limit. Nothing was locked beyond the window, and the saved sessions are what later scenes used.

## What is not in git

- `accounts.json` and `state/*.json`. Passwords and session cookies.
- `rec/`, `shots/`, `out/`, `audio/soundtrack.wav`. Large, and the frames show the Owner session.
- `tools/ffmpeg`. A third-party binary. Rebuilds need the same encoder, or any ffmpeg with libx264 and aac.
- The two mp4 files. They are served from `/var/www` and are not source.

To take a film off the site, delete its files under `/var/www/ja-promo-video` or `/var/www/ja-promo-video2`, or remove the `import` line and reload Caddy.
