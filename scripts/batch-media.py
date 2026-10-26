#!/usr/bin/env python3
"""Split a folder of photos and videos into upload batches ordered by capture time.

HEIC/HEIF photos are converted to JPG with macOS `sips`; JPG/PNG and videos are copied.
Photos go to 01, 02, ...; videos go to V01, V02, ... Originals are never modified.
The run is resumable: files already present in the destination are skipped.

usage: python3 -I scripts/batch-media.py SRC DST [--size 300] [--video-size 100] [--run]
Without --run only the plan is printed.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

PHOTO = {".heic", ".heif", ".jpg", ".jpeg", ".png"}
VIDEO = {".mov", ".mp4", ".m4v"}


def option(name: str, default: int) -> int:
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def taken(p: Path) -> str:
    out = subprocess.run(
        ["mdls", "-raw", "-name", "kMDItemContentCreationDate", str(p)],
        capture_output=True,
        text=True,
    ).stdout.strip()
    if not out or out == "(null)":
        # No capture time: sort after everything else, by modification time.
        out = f"9999 {p.stat().st_mtime:020.3f}"
    return out


def convert_heic(p: Path, out: Path) -> None:
    tmp = out.with_name(out.name + ".part")
    r = subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", str(p), "--out", str(tmp)],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        tmp.unlink(missing_ok=True)
        print("FAIL", p.name, r.stderr.strip())
        return
    os.replace(tmp, out)


def copy(p: Path, out: Path) -> None:
    tmp = out.with_name(out.name + ".part")
    shutil.copy2(p, tmp)
    os.replace(tmp, out)


def main() -> None:
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    size = option("--size", 300)
    video_size = option("--video-size", 100)
    run = "--run" in sys.argv

    files = [p for p in sorted(src.iterdir()) if p.is_file() and not p.name.startswith(".")]
    photos = sorted((p for p in files if p.suffix.lower() in PHOTO), key=lambda p: (taken(p), p.name))
    videos = sorted((p for p in files if p.suffix.lower() in VIDEO), key=lambda p: (taken(p), p.name))
    skipped = [p.name for p in files if p not in photos and p not in videos]

    jobs = []
    for prefix, items, step in (("", photos, size), ("V", videos, video_size)):
        for i in range(0, len(items), step):
            jobs.append((f"{prefix}{i // step + 1:02d}", items[i : i + step]))

    print(f"photos {len(photos)}, videos {len(videos)}, skipped {len(skipped)} {skipped[:5]}")
    for name, items in jobs:
        print(f"  {name}: {len(items)}  {items[0].name} .. {items[-1].name}")
    if not run:
        return

    for name, items in jobs:
        d = dst / name
        d.mkdir(parents=True, exist_ok=True)
        for stale in d.glob("*.part"):
            stale.unlink()
        for p in items:
            if p.suffix.lower() in {".heic", ".heif"}:
                out = d / (p.stem + ".jpg")
                if not out.exists():
                    convert_heic(p, out)
            else:
                out = d / p.name
                if not out.exists():
                    copy(p, out)
        print("done", name, flush=True)


main()
