from pathlib import Path
import hashlib,json,subprocess,datetime,re
root=Path('/home/kripta/ja-automation-platform-vps-hotfix');d=root/'docs/manuals'
manifest=json.loads((d/'validation/current-capture.json').read_text())
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for buildname in ['manual-build.json','manual-build-PT-BR.json']:
 build=json.loads((d/buildname).read_text())
 assert build['sourceDigest']==manifest['sourceDigest']
 assert build['captureManifestSha256']==hashfile(d/'validation/current-capture.json')
 for row in build['outputs']:
  p=d/row['file'];assert hashfile(p)==row['sha256'];assert hashfile(d/row['source'])==row['sourceSha256']
  info=subprocess.check_output(['pdfinfo',str(p)],text=True)
  pages=int(re.search(r'Pages:\s+(\d+)',info).group(1))
  fonts=subprocess.check_output(['pdffonts',str(p)],text=True).splitlines()[2:]
  assert fonts and all(line.split()[-5] == 'yes' for line in fonts)
  images=subprocess.check_output(['pdfimages','-list',str(p)],text=True).splitlines()[2:]
  text=subprocess.check_output(['pdftotext',str(p),'-'],text=True)
  assert images and len(text.split())>150
  rows.append({'file':row['file'],'pages':pages,'bytes':p.stat().st_size,'sha256':row['sha256'],'embeddedFonts':len(fonts),'images':len(images),'extractedWords':len(text.split()),'source':row['source'],'sourceSha256':row['sourceSha256']})
assert len(rows)==9 and len({r['file'] for r in rows})==9
out={'validatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Nine active manuals refreshed for operational recovery, agenda and inbox','sourceDigest':manifest['sourceDigest'],'sourceCommit':manifest['sourceCommit'],'captureManifestSha256':hashfile(d/'validation/current-capture.json'),'screenshots':len(manifest['screenshots']),'captureChecks':len(manifest['checks']),'checkedPdfs':len(rows),'manuals':rows}
(d/'validation/pdf-quality.json').write_text(json.dumps(out,indent=2)+'\n')
(root/'docs/evidence/operational-ux-followup-20260922/pdf-quality.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'pdfs':len(rows),'screenshots':out['screenshots'],'checks':out['captureChecks']}))
