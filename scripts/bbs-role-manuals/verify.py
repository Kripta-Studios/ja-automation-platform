"""Validate generated role PDFs, evidence hashes and attachment integrity."""
from pathlib import Path
import hashlib,json,re
from pypdf import PdfReader

root=Path(__file__).resolve().parents[2]
docs=root/'docs/manuals'
report=json.loads((docs/'bbs-role-manuals-build.json').read_text())
expected={'owner','finance','auditor','manager','worker','chief','supplier-coordinator','external-technician'}
assert {r['role'] for r in report['reports']}==expected, 'Missing role manuals'
results=[]
for item in report['reports']:
 path=docs/item['filename'];blob=path.read_bytes();reader=PdfReader(path,strict=True)
 assert hashlib.sha256(blob).hexdigest()==item['sha256']
 assert len(reader.pages)==item['pages']
 assert not item['missing'] and not item['overflows']
 assert item.get('instructionText')=='PASS'
 assert all(p.extract_text().strip() for p in reader.pages), 'Blank page'
 # Chromium may wrap a semantic filename after a hyphen; PDF extraction inserts
 # whitespace within that word. Preserve every non-whitespace character in order.
 normalize=lambda s: re.sub(r'\s+','',s)
 text=normalize(' '.join(p.extract_text() for p in reader.pages))
 content=json.loads((root/'scripts/bbs-role-manuals/content'/f"{item['role']}.json").read_text())
 for chapter in content['chapters']:
  required=[s for k in ['paragraphs','steps','checks','recovery'] for s in chapter.get(k,[])]+[f['caption'] for f in chapter.get('figures',[])]
  for sentence in required:
   assert normalize(sentence) in text, f"Missing PDF instruction: {item['role']} / {chapter['id']}"
 for figure in item['figures']:
  assert hashlib.sha256((root/figure['path']).read_bytes()).hexdigest()==figure['sha256'], 'Screenshot changed after rendering'
 if item['role']!='owner':
  assert item['figures'], 'Missing illustrated role evidence'
 else:
  assert len(reader.attachments)==6
  course=PdfReader(docs/'BBS_Project_to_Client_Invoices_Guide_EN.pdf',strict=True)
  assert dict(reader.attachments)==dict(course.attachments)
  for n in range(1,7):assert reader.pages[-n].get_contents().get_data()==course.pages[-n].get_contents().get_data()
 results.append({'role':item['role'],'pages':len(reader.pages),'landscape':sum(float(p.mediabox.width)>float(p.mediabox.height) for p in reader.pages),'figures':len(item['figures']),'sha256':item['sha256'],'strictPdf':'PASS','imageHashes':'PASS'})
print(json.dumps(results,indent=2))
(root/'docs/evidence/bbs-role-manuals-20261006/pdf-verification.json').write_text(json.dumps({'status':'PASS','manuals':results},indent=2)+'\n')
