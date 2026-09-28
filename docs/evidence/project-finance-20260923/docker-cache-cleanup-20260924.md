# Docker cache cleanup — 2026-09-24

Scope: inspect Docker space, prune empty cache, and remove only the two oldest unused J&A release image pairs. Production containers, the active and two newest prior J&A release pairs, other applications, volumes, databases and mail services were preserved.

## Before

- Root filesystem: 150 GiB total, 134 GiB used, 11 GiB available (93%; `df -h /`).
- Docker build cache: **0 bytes** (`docker system df -v`).
- Dangling images: **none** (`docker image ls --filter dangling=true`).
- The active J&A portal, jobs and site containers all used the `zip-d215671b99323d6d8c4ce34b74b4f8e0` image pair. Four older `rollback-*` image pairs had no containers.
- Named Docker volumes were in use and retained. Stopped containers belonging to another application were retained.

## Commands run

```sh
docker builder prune -f
docker image prune -f
```

Each command reported **`Total reclaimed space: 0B`**. `docker system prune` and `docker volume prune` were not used.

## Older unused J&A images

An additional review showed 9.876 GB of Docker images marked reclaimable, although build cache was zero. Before image removal, `df -B1 /` reported **142,834,864,128 bytes used** and **11,543,982,080 bytes available**. `docker system df` reported **19.24 GB** of images. `docker ps -a --no-trunc` and `docker image inspect` confirmed the four candidates below had no container references. A guarded script checked each exact full image ID and that all tags belonged to `ja-automation-portal` or `ja-automation-site` before calling `docker image rm --force <exact-image-id>`.

| Old release | Portal image ID | Site image ID |
|---|---|---|
| `zip-6118658093b470dcdd33c78c13e974d9` | `sha256:cc6a1baef8a3c3d028585d2974d243d177ce9233750d8b01976c83f4f6e3efca` | `sha256:10c30dfa6936325dbe5b121f625ff815241c48c6c36ec559f43015a70a9239f6` |
| `zip-361f7828d5d93c09dde6019ad4fd3168` | `sha256:a718d264dc434373a74807e748101082030efc43f359f6fa95ce5ebaeba8bb88` | `sha256:81e70b5b3db322b223fbfa946a62950cc5ec0f67dbccc1996c211739bf4e00ec` |

The active `d215671b…` pair and the two newest prior pairs, `b0276b4…` and `d444cae…`, remain tagged. No unrelated image was removed.

## After

- Docker build cache: **0 bytes** (`docker system df -v`).
- Docker cache/dangling-image bytes reclaimed: **0 bytes**.
- After old-image removal, Docker image usage dropped from **19.24 GB to 16.01 GB** (`docker system df`).
- Root filesystem after old-image removal: 160,970,244,096 bytes total; **139,609,317,376 bytes used**; **14,769,528,832 bytes available** (`df -B1 /`). Relative to the exact pre-removal reading above, available space increased **3,225,546,752 bytes** (about 3.00 GiB), and filesystem usage fell from 93% to 91%.
- Docker root `/var/lib/docker` used about 8.9 GiB (`du -sh`); the J&A checkout about 2.3 GiB. Root usage is therefore not primarily removable Docker build cache.
- Portal/site remained healthy and jobs remained running (`docker ps`). The tagged current and two newest prior J&A release pairs remain available for rollback.

Further disk recovery would require a separate inventory of non-cache files or another explicit release-retention decision. Unrelated applications' images and all named volumes were untouched.
