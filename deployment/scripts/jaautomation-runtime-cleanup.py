#!/usr/bin/env python3
"""Remove processed releases beyond the two rollback versions and Docker build cache."""

from __future__ import annotations

import fcntl
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


RELEASE_NAME = re.compile(r"ja-automation-([0-9a-f]{64})\Z")
RELEASE_ROOT = Path("/opt/jaautomation/releases")
CURRENT_LINK = Path("/opt/jaautomation/current")
STATE_ROOT = Path("/var/lib/jaautomation-zip-deploy")


def prune_releases(release_root: Path, current_link: Path, processed_file: Path) -> tuple[int, int]:
    if release_root.is_symlink() or not release_root.is_dir():
        raise RuntimeError("release root is not a real directory")
    active = current_link.resolve(strict=True)
    if active.parent != release_root.resolve():
        print("release_cleanup_skipped=unmanaged_active_release")
        return 0, 0
    if not RELEASE_NAME.fullmatch(active.name) or not active.is_dir():
        raise RuntimeError("active release has an unexpected layout")
    processed = set(processed_file.read_text().splitlines())
    if active.name.removeprefix("ja-automation-") not in processed:
        raise RuntimeError("active release is missing from processed deployment state")

    candidates: list[Path] = []
    skipped = 0
    for path in release_root.iterdir():
        match = RELEASE_NAME.fullmatch(path.name)
        if not match:
            continue
        if path.is_symlink() or not path.is_dir() or os.path.ismount(path):
            raise RuntimeError(f"unsafe release entry: {path}")
        if match.group(1) not in processed:
            skipped += 1
            continue
        candidates.append(path)

    previous = sorted(
        (path for path in candidates if path != active),
        key=lambda path: path.stat().st_mtime_ns,
        reverse=True,
    )[:2]
    keep = {active, *previous}
    removed = 0
    for path in candidates:
        if path in keep:
            continue
        shutil.rmtree(path)
        removed += 1
    return removed, skipped


def main() -> int:
    if os.geteuid() != 0:
        raise RuntimeError("runtime cleanup must run as root")
    if STATE_ROOT.is_symlink():
        raise RuntimeError("deployment state root is a symlink")
    STATE_ROOT.mkdir(mode=0o750, parents=True, exist_ok=True)
    with (STATE_ROOT / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("cleanup_skipped=deployment_in_progress")
            return 0
        removed, skipped = prune_releases(
            RELEASE_ROOT, CURRENT_LINK, STATE_ROOT / "processed.sha256"
        )
        print(f"old_releases_removed={removed} unprocessed_releases_skipped={skipped}")
        result = subprocess.run(
            ["/usr/bin/docker", "builder", "prune", "--all", "--force"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Docker build cache cleanup failed: {result.stderr.strip()}")
        summary = next(
            (line for line in result.stdout.splitlines() if line.startswith("Total reclaimed space:")),
            "Total reclaimed space: unknown",
        )
        print(f"docker_build_cache_reclaimed={summary.split(':', 1)[1].strip()}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError) as error:
        print(f"runtime_cleanup_failed={error}", file=sys.stderr)
        sys.exit(1)
