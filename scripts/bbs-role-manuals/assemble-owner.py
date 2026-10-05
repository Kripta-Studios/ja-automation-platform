"""Append the verified BBS course to the Owner role introduction, retaining native evidence."""
from pathlib import Path
from io import BytesIO
import hashlib
import json
from pypdf import PdfReader, PdfWriter

root = Path(__file__).resolve().parents[2]
docs = root / 'docs/manuals'
report_path = docs / 'bbs-role-manuals-build.json'
report = json.loads(report_path.read_text())
entry = next(item for item in report['reports'] if item['role'] == 'owner')
target = docs / entry['filename']
intro = PdfReader(BytesIO(target.read_bytes()), strict=True)
course = PdfReader(docs / 'BBS_Project_to_Client_Invoices_Guide_EN.pdf', strict=True)
assert len(intro.pages) == entry['pages'], 'Rebuild the introduction before assembling it.'
assert len(course.pages) == 203, 'The verified source course changed; inspect before assembling.'
writer = PdfWriter()
writer.append(intro, outline_item='Owner role responsibilities and handoffs')
writer.append(course, outline_item='Illustrated BBS course · original internal pages 1–203')
for name, contents in course.attachments.items():
    for content in contents:
        writer.add_attachment(name, content)
writer.add_metadata({'/Title': 'Owner · BBS operating manual', '/Author': 'J&A Automation', '/Subject': 'Owner role handoffs and the illustrated BBS training course'})
buffer = BytesIO()
writer.write(buffer)
blob = buffer.getvalue()
result = PdfReader(BytesIO(blob), strict=True)
assert len(result.pages) == len(intro.pages) + len(course.pages)
annotation_count = sum(len(p.get('/Annots', [])) for p in course.pages)
assert all(len(p.get('/Annots', [])) == len(result.pages[len(intro.pages)+i].get('/Annots', [])) for i,p in enumerate(course.pages)), 'Course annotations changed.'
assert {name: contents for name, contents in result.attachments.items()} == {name: contents for name, contents in course.attachments.items()}
for offset in range(1, 7):
    assert result.pages[-offset].get_contents().get_data() == course.pages[-offset].get_contents().get_data(), 'Native invoice annex changed.'
target.write_bytes(blob)
entry.update(introductionPages=len(intro.pages), coursePages=len(course.pages), pages=len(result.pages), landscape=sum(float(p.mediabox.width) > float(p.mediabox.height) for p in result.pages), bytes=len(blob), sha256=hashlib.sha256(blob).hexdigest(), nativeAttachments=len(result.attachments), nativeInvoiceAnnexPages=6, nativeInvoiceStreamsUnchanged=True, courseAnnotationsRetained=annotation_count)
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: entry[key] for key in ['role', 'pages', 'nativeAttachments', 'nativeInvoiceStreamsUnchanged', 'sha256']}))
