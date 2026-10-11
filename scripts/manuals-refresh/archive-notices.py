"""Idempotent archive covers; original page streams and attachments stay intact."""
import hashlib,json,sys
from pathlib import Path
from io import BytesIO
from pypdf import PdfReader,PdfWriter
root=Path.cwd(); scratch=Path(sys.argv[1]); rows=[]
for name in json.loads((scratch/'files.json').read_text()):
 path=root/'docs/manuals'/name; original=PdfReader(path,strict=True)
 marked=bool((original.metadata or {}).get('/JAArchiveNoticeRevision'))
 start=1 if marked else 0
 lang='pt' if 'PT-BR' in name else 'es' if name.endswith('_ES.pdf') else 'en'
 cover=PdfReader(scratch/(lang+'.pdf')); writer=PdfWriter();writer.append(cover,import_outline=False)
 writer.append(original,pages=(start,len(original.pages)),import_outline=True)
 for key,items in original.attachments.items():
  for blob in items:writer.add_attachment(key,blob)
 writer.add_metadata({'/Title':name.removesuffix('.pdf').replace('_',' ')+' · historical edition','/JAArchiveNoticeRevision':'2026-10-11'})
 out=BytesIO();writer.write(out);blob=out.getvalue();check=PdfReader(BytesIO(blob),strict=True)
 assert len(check.pages)==len(original.pages)-start+1
 for i in range(start,len(original.pages)):
  assert check.pages[i-start+1].get_contents().get_data()==original.pages[i].get_contents().get_data()
 assert dict(check.attachments)==dict(original.attachments)
 path.write_bytes(blob); rows.append(dict(filename=name,language=lang,pages=len(check.pages),originalPageStreamsUnchanged=True,sha256=hashlib.sha256(blob).hexdigest()))
path=root/'docs/evidence/manuals-refresh-20261011/archives.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(rows,indent=2)+'\n');print(f'{len(rows)} historical editions labelled; original page streams unchanged')
