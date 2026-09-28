# VPS disk cleanup — 2026-09-23

The root filesystem was at 96% use with 6.5 GiB available before the additional image cleanup. After removing superseded J&A image tags, `df -h /` reported 81% use and 29 GiB available.

Actions performed:

- Pruned Docker build cache (`docker builder prune -af`), reclaiming 6.955 GB.
- Removed five superseded handoff ZIP archives from `/home/kripta` (about 1.03 GB).
- Removed superseded J&A portal/site image tags older than the active `zip-4cbf52f162a73ccaadcea8d9d8405e7b` and immediately preceding `zip-97502e4a6676a5a7c91435e42522c3b3` releases. Docker deleted 14 unused image IDs. Active release, prior rollback image and their aliases were retained.
- Restored `jaautomation-zip-deploy.path` and `.timer` after the release operation. Both were active; portal and site containers were healthy, and the jobs container was running.

No database volume, business document, backup, running container, mail service or unrelated application image was removed. `docker system df` still reports 9.303 GB reclaimable among other images; those were retained because other applications on this VPS may need them for rollback.

On 2026-09-24, after the later migration-58 rehearsal passed, the superseded v4 isolated clean-slate rehearsal directory was removed. The v5 and migration-58 rehearsal archives remain. `df -h /home/kripta` then reported 9.0 GiB available (94% used). Docker build cache remains empty; the 9.547 GB of reclaimable images was retained pending rollback-image review.

A subsequent explicit image inventory showed that seven 2026-09-23 J&A portal/site image pairs were neither running nor among the current two rollback releases. Only those old J&A tags/images were removed. The running `zip-d444cae7d8a9b6c5d4d6309b72177837` pair and the `zip-6118658093b470dcdd33c78c13e974d9` and `zip-361f7828d5d93c09dde6019ad4fd3168` rollback pairs remain. `df -h` then showed **22 GiB available (85% used)**. No unrelated images, volumes, containers, database, artifacts or mail service were touched.
