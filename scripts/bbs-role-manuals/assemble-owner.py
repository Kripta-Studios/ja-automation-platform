"""Add task outlines and native invoice annexes to continuously paginated manuals."""
from pathlib import Path
from io import BytesIO
import hashlib, json
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link
from pypdf.generic import Fit

root = Path(__file__).resolve().parents[2]
docs = root/'docs/manuals'
report_path = docs/'bbs-role-manuals-build.json'
report = json.loads(report_path.read_text())
course = PdfReader(docs/'BBS_Project_to_Client_Invoices_Guide_EN.pdf', strict=True)
for entry in report['reports']:
    assert not entry.get('assembled'), 'Rebuild before assembling again.'
    target = docs/entry['filename']
    body = PdfReader(BytesIO(target.read_bytes()), strict=True)
    assert len(body.pages) == entry['pages'], 'Rebuild before assembling.'
    writer = PdfWriter()
    writer.append(body, import_outline=False)
    writer.add_outline_item('Start here', 0)
    for section in entry['sections']:
        writer.add_outline_item(section['title'], section['page']-1)
    if entry['role'] == 'owner':
        for page in course.pages[-6:]:
            writer.add_page(page)
        for i, title in enumerate(['A · Final labor invoice', 'B · Final expense invoice', 'C · Final mixed-unit invoice']):
            writer.add_outline_item(title, len(body.pages)+i*2)
        for name, contents in course.attachments.items():
            for content in contents:
                writer.add_attachment(name, content)
        for link in entry.get('annexLinks', []):
            x,y,w,h = link['rect']
            source = writer.pages[link['page']]
            height = float(source.mediabox.height)
            writer.add_annotation(link['page'], Link(rect=(x*.75,height-(y+h)*.75,(x+w)*.75,height-y*.75),
                target_page_index=len(body.pages)+'abc'.index(link['target'][-1])*2, fit=Fit.fit()))
    writer.add_metadata({'/Title': entry['filename'].removesuffix('_EN.pdf').replace('_',' '),
                         '/Author': 'J&A Automation', '/Subject': 'Role operating course · 7 October 2026 confidentiality revision'})
    stream = BytesIO();writer.write(stream);blob=stream.getvalue()
    check=PdfReader(BytesIO(blob),strict=True)
    assert len(check.outline)>=len(entry['sections'])
    if entry['role']=='owner':
        for i,title in enumerate(['A · Final labor invoice', 'B · Final expense invoice', 'C · Final mixed-unit invoice']):
            destination = next(item for item in check.outline if not isinstance(item,list) and item.title==title)
            assert check.get_destination_page_number(destination)==len(body.pages)+i*2, 'Wrong native invoice bookmark'
        assert dict(check.attachments)==dict(course.attachments)
        for n in range(1,7):
            assert check.pages[-n].get_contents().get_data()==course.pages[-n].get_contents().get_data()
        entry.update(nativeAttachments=6,nativeInvoiceAnnexPages=6,nativeInvoiceStreamsUnchanged=True,
                     courseIntegrated=True,bodyPages=len(body.pages))
    target.write_bytes(blob)
    entry.update(pages=len(check.pages), bytes=len(blob), sha256=hashlib.sha256(blob).hexdigest(),
                 assembled=True,
                 outlineEntries=len(check.outline),
                 landscape=sum(float(p.mediabox.width)>float(p.mediabox.height) for p in check.pages))
    print(f"{entry['role']}: {len(check.pages)} pages, {len(check.outline)} bookmarks")
report_path.write_text(json.dumps(report,indent=2)+'\n')
