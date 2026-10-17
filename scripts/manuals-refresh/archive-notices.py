"""Replace archive notice covers and verify historical pages against a baseline."""
import hashlib
import json
import os
import sys
import tempfile
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter


REVISION = "2026-10-17"
root = Path.cwd()
scratch = Path(sys.argv[1])
evidence_path = Path(
    os.environ.get(
        "JA_MANUAL_ARCHIVE_EVIDENCE",
        "docs/evidence/manuals-refresh-20261011/archives.json",
    )
)
baseline_path = os.environ.get("JA_MANUAL_ARCHIVE_BASELINE")
help_url = os.environ.get(
    "JA_MANUAL_CURRENT_HELP_URL", "https://j-aautomation.com/j-aautomation/app/help"
)
files = json.loads((scratch / "files.json").read_text())
if len(files) != 25:
    raise SystemExit(f"Expected 25 historical PDFs, found {len(files)}")


def sha256(blob):
    return hashlib.sha256(blob).hexdigest()


def page_hashes(reader, start=0):
    result = []
    for page in reader.pages[start:]:
        contents = page.get_contents()
        if contents is None:
            result.append(sha256(b""))
        else:
            result.append(sha256(contents.get_data()))
    return result


def attachment_hashes(reader):
    result = {}
    for name, values in reader.attachments.items():
        if isinstance(values, (bytes, bytearray)):
            values = [values]
        result[name] = sorted(sha256(value) for value in values)
    return dict(sorted(result.items()))


def baseline_attachment_hashes(value):
    """Normalize the baseline's attachment map to lists of SHA-256 strings."""
    result = {}
    for name, hashes in value.items():
        if isinstance(hashes, str):
            hashes = [hashes]
        result[name] = sorted(hashes)
    return dict(sorted(result.items()))


def help_link_urls(page):
    urls = []
    for annotation in page.get("/Annots", []):
        action = annotation.get_object().get("/A")
        if action and action.get("/URI"):
            urls.append(str(action.get("/URI")))
    return urls


def destination_signature(reader, value, body_page_offset):
    if value is None:
        return None
    if hasattr(value, "get_object"):
        value = value.get_object()
    if isinstance(value, (list, tuple)):
        if not value:
            return ("empty",)
        try:
            page_number = reader.get_page_number(value[0]) - body_page_offset
        except (TypeError, ValueError):
            page_number = str(value[0])
        return ("page", page_number, tuple(str(part) for part in value[1:]))
    return ("named", str(value))


def annotation_signatures(reader, page, body_page_offset):
    result = []
    for reference in page.get("/Annots", []):
        annotation = reference.get_object()
        action = annotation.get("/A")
        if action:
            action = action.get_object()
        destination = action.get("/D") if action and action.get("/D") is not None else annotation.get("/Dest")
        rect = annotation.get("/Rect", [])
        result.append(
            (
                str(annotation.get("/Subtype")),
                tuple(str(part) for part in rect),
                str(annotation.get("/Contents")) if annotation.get("/Contents") is not None else None,
                str(action.get("/S")) if action else None,
                str(action.get("/URI")) if action and action.get("/URI") is not None else None,
                destination_signature(reader, destination, body_page_offset),
            )
        )
    return result


baseline = None
baseline_rows = {}
if baseline_path:
    baseline = json.loads(Path(baseline_path).read_text())
    baseline_rows = {row["filename"]: row for row in baseline["pdfs"]}
    if set(files) != set(baseline_rows):
        missing = sorted(set(baseline_rows) - set(files))
        extra = sorted(set(files) - set(baseline_rows))
        raise SystemExit(f"PDF inventory differs from baseline; missing={missing}, extra={extra}")

rows = []
staged_files = []
total_body_pages = 0
total_replaced_covers = 0
for name in files:
    path = root / "docs/manuals" / name
    original_blob = path.read_bytes()
    original = PdfReader(BytesIO(original_blob), strict=True)
    metadata = original.metadata or {}
    marker = metadata.get("/JAArchiveNoticeRevision")
    start = 1 if marker else 0
    if marker:
        if marker not in ("2026-10-11", REVISION):
            raise SystemExit(f"Unsupported archive notice revision in {name}: {marker}")
        first_text = original.pages[0].extract_text() or ""
        if not any(title in first_text for title in ("Historical manual", "Manual histórico")):
            raise SystemExit(f"Refusing to replace page 1 of {name}: archive marker has no known notice title")
        if not page_hashes(original, 0) or not len(original.pages) > 1:
            raise SystemExit(f"Invalid existing archive cover in {name}")

    body_before = page_hashes(original, start)
    attachments_before = attachment_hashes(original)
    annotation_count_before = sum(
        len(annotation_signatures(original, original.pages[index], start))
        for index in range(start, len(original.pages))
    )
    baseline_cover_hash = None
    if baseline is not None:
        baseline_row = baseline_rows[name]
        expected_page_hashes = baseline_row["originalPageStreamSha256"]
        if len(original.pages) != baseline_row["pageCount"] or len(expected_page_hashes) != baseline_row["pageCount"]:
            raise SystemExit(f"Baseline page count differs for {name}")
        if marker == "2026-10-11" and sha256(original_blob) != baseline_row["sha256"]:
            raise SystemExit(f"Baseline whole-file hash differs for {name}")
        if marker:
            baseline_cover_hash = expected_page_hashes[0]
            expected_body_hashes = expected_page_hashes[1:]
        else:
            expected_body_hashes = expected_page_hashes
        if body_before != expected_body_hashes:
            raise SystemExit(f"Historical body page streams differ from baseline for {name}")
        expected_attachments = baseline_attachment_hashes(baseline_row["attachments"])
        if attachments_before != expected_attachments:
            raise SystemExit(f"Attachment hashes differ from baseline for {name}")

    lang = "pt" if "PT-BR" in name else "es" if name.endswith("_ES.pdf") else "en"
    cover = PdfReader(scratch / f"{lang}.pdf", strict=True)
    if len(cover.pages) != 1:
        raise SystemExit(f"Expected a one-page {lang} notice cover")
    cover_urls = help_link_urls(cover.pages[0])
    if help_url not in cover_urls:
        raise SystemExit(f"The {lang} notice PDF does not link to current Help: {cover_urls}")

    writer = PdfWriter()
    writer.append(cover, import_outline=False)
    writer.append(original, pages=(start, len(original.pages)), import_outline=True)
    for attachment_name, blobs in original.attachments.items():
        if isinstance(blobs, (bytes, bytearray)):
            blobs = [blobs]
        for blob in blobs:
            writer.add_attachment(attachment_name, blob)
    writer.add_metadata(
        {
            "/Title": name.removesuffix(".pdf").replace("_", " ") + " · historical edition",
            "/JAArchiveNoticeRevision": REVISION,
        }
    )

    output = BytesIO()
    writer.write(output)
    output_blob = output.getvalue()
    check = PdfReader(BytesIO(output_blob), strict=True)
    body_after = page_hashes(check, 1)
    attachments_after = attachment_hashes(check)
    annotations_unchanged = True
    annotation_count_after = 0
    for source_index, output_index in zip(range(start, len(original.pages)), range(1, len(check.pages))):
        source_annotations = annotation_signatures(original, original.pages[source_index], start)
        output_annotations = annotation_signatures(check, check.pages[output_index], 1)
        annotation_count_after += len(output_annotations)
        if source_annotations != output_annotations:
            annotations_unchanged = False
    if body_after != body_before:
        raise SystemExit(f"A historical page stream changed while writing {name}")
    if not annotations_unchanged or annotation_count_after != annotation_count_before:
        raise SystemExit(f"A historical page link or annotation changed while writing {name}")
    if attachments_after != attachments_before:
        raise SystemExit(f"An attachment changed while writing {name}")
    expected_pages = len(original.pages) - start + 1
    if len(check.pages) != expected_pages:
        raise SystemExit(f"Unexpected page count for {name}: {len(check.pages)} != {expected_pages}")
    if (check.metadata or {}).get("/JAArchiveNoticeRevision") != REVISION:
        raise SystemExit(f"New archive revision metadata missing in {name}")
    output_cover_text = check.pages[0].extract_text() or ""
    expected_title = "Historical manual" if lang == "en" else "Manual histórico"
    if expected_title not in output_cover_text or help_url not in help_link_urls(check.pages[0]):
        raise SystemExit(f"Localized cover or current Help link missing after writing {name}")
    output_cover_hash = page_hashes(check, 0)[0]
    if baseline_cover_hash and output_cover_hash == baseline_cover_hash:
        raise SystemExit(f"The dated archive cover was not replaced in {name}")

    rows.append(
        {
            "filename": name,
            "language": lang,
            "pages": len(check.pages),
            "historicalBodyPageCount": len(body_before),
            "archiveNoticeRevision": REVISION,
            "sourceNoticeRevision": marker,
            "baselineNoticePageStreamSha256": baseline_cover_hash,
            "replacementNoticePageStreamSha256": output_cover_hash,
            "historicalBodyPageStreams": {
                "beforeSha256": body_before,
                "afterSha256": body_after,
                "unchanged": body_before == body_after,
            },
            "historicalBodyAnnotations": {
                "beforeCount": annotation_count_before,
                "afterCount": annotation_count_after,
                "unchanged": annotations_unchanged,
            },
            "attachments": {
                "beforeSha256ByName": attachments_before,
                "afterSha256ByName": attachments_after,
                "unchanged": attachments_before == attachments_after,
            },
            "sourcePdfSha256": sha256(original_blob),
            "refreshedPdfSha256": sha256(output_blob),
        }
    )
    total_body_pages += len(body_before)
    total_replaced_covers += 1 if start else 0

    staged_files.append((path, output_blob, sha256(output_blob)))

# Every source and output has passed page, attachment, metadata, and link checks before writes begin.
temporary_files = []
try:
    for final_path, output_blob, expected_sha in staged_files:
        temporary = tempfile.NamedTemporaryFile(
            mode="wb", prefix=f".{final_path.name}.", suffix=".archive-refresh.tmp", dir=final_path.parent, delete=False
        )
        try:
            temporary.write(output_blob)
            temporary.flush()
            os.fsync(temporary.fileno())
        finally:
            temporary.close()
        os.chmod(temporary.name, 0o644)
        temporary_path = Path(temporary.name)
        temporary_files.append((temporary_path, final_path, expected_sha))
    for temporary_path, final_path, expected_sha in temporary_files:
        temporary_path.replace(final_path)
        if sha256(final_path.read_bytes()) != expected_sha:
            raise SystemExit(f"Post-write PDF hash mismatch: {final_path.name}")
except BaseException:
    for temporary_path, _, _ in temporary_files:
        temporary_path.unlink(missing_ok=True)
    raise

if baseline is not None:
    baseline_stream_count = sum(len(row["originalPageStreamSha256"]) for row in baseline["pdfs"])
else:
    baseline_stream_count = None

summary = {
    "archiveNoticeRevision": REVISION,
    "currentHelpUrl": help_url,
    "historicalPdfCount": len(rows),
    "baselinePageStreamCountIncludingOldNotices": baseline_stream_count,
    "replacedExistingArchiveNoticeCount": total_replaced_covers,
    "preservedHistoricalBodyPageStreamCount": total_body_pages,
    "allHistoricalBodyPageStreamsUnchanged": all(
        row["historicalBodyPageStreams"]["unchanged"] for row in rows
    ),
    "allHistoricalBodyAnnotationsUnchanged": all(
        row["historicalBodyAnnotations"]["unchanged"] for row in rows
    ),
    "allAttachmentsUnchanged": all(row["attachments"]["unchanged"] for row in rows),
    "pdfs": rows,
}
evidence_path.parent.mkdir(parents=True, exist_ok=True)
evidence_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
print(
    f"{len(rows)} historical editions refreshed; {total_replaced_covers} old notice covers replaced; "
    f"{total_body_pages} historical body page streams and all attachments unchanged"
)
print(f"Archive evidence: {evidence_path}")
