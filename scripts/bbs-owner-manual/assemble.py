from pathlib import Path
import hashlib,json
from pypdf import PdfReader,PdfWriter
from pypdf.annotations import Link
from pypdf.generic import Fit
ROOT=Path(__file__).resolve().parent
DOCS=ROOT.parent.parent/'docs/manuals'
ARTIFACTS=DOCS/'bbs-example-artifacts'
layout=json.loads((DOCS/'bbs-manual-layout.json').read_text())
checks=json.loads((DOCS/'bbs-manual-browser-layout.json').read_text())
assert not checks['missingImages'] and not checks['overflows']
writer=PdfWriter(clone_from=DOCS/'bbs-manual-body.pdf')
assert len(writer.pages)==layout['guidePages'], (len(writer.pages),layout['guidePages'])
originals=[('A · Final labor invoice','BBS-DEMO-labor-issued-en.pdf','2,230.00','JA-DEMO--2026-000001'),('B · Final expense invoice','BBS-DEMO-expense-issued-en.pdf','182.00','JA-DEMO--2026-000002'),('C · Final mixed-unit invoice','BBS-DEMO-mixed-issued-en.pdf','2,260.00','JA-DEMO--2026-000003')]
proof=[]
for title,filename,total,number in originals:
    src=ARTIFACTS/filename;reader=PdfReader(src)
    text='\n'.join(p.extract_text() for p in reader.pages)
    assert len(reader.pages)==2 and total in text and number in text
    assert 'DRAFT INVOICE' not in text and 'DRAFT PREVIEW' not in text and 'DRAFT' not in text
    start=len(writer.pages);writer.append(reader,import_outline=False)
    writer.add_outline_item(title,start);writer.add_attachment(filename,src.read_bytes())
    proof.append({'filename':filename,'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'pages':2,'startsOnPage':start+1,'totalUSD':total,'invoiceNumber':number,'state':'Issued in isolated training'})
for workbook in sorted(ARTIFACTS.glob('*.xlsx')):
    writer.add_attachment(workbook.name,workbook.read_bytes())
# Convert measured HTML link geometry into PDF points. All contents pages are portrait A4.
for link in checks['appendixLinks']:
    appendix='abc'.index(link['target'][-1]);x,y,width,height=link['rect']
    left=15*72/25.4+x*.75;top=841.92-16*72/25.4-y*.75
    writer.add_annotation(link['contentsPage'],Link(rect=(left,top-height*.75,left+width*.75,top),target_page_index=layout['guidePages']+appendix*2,fit=Fit.fit()))
writer.add_metadata({'/Title':'BBS · Owner operating reference and final invoice lab','/Author':'J&A Automation','/Subject':'Owner operating course; isolated issued training invoices; historical pre-issue and later lifecycle XLSX; explicit environments and verified/reference boundaries','/Keywords':'BBS, Owner, Finance, hourly, daily, weekly, compensation, expenses, final invoice, training, XLSX'})
assert len(writer.pages)==layout['totalPages']
out=DOCS/'BBS_Project_to_Client_Invoices_Guide_EN.pdf';tmp=out.with_suffix('.pdf.tmp')
with tmp.open('wb') as f:writer.write(f)
check=PdfReader(tmp,strict=True)
assert len(check.pages)==layout['totalPages']
for item in proof:
    assert hashlib.sha256(check.attachments[item['filename']][0]).hexdigest()==item['sha256']
    src=PdfReader(ARTIFACTS/item['filename'])
    for offset in range(2):
        assert check.pages[item['startsOnPage']-1+offset].get_contents().get_data()==src.pages[offset].get_contents().get_data()
for workbook in ARTIFACTS.glob('*.xlsx'):
    assert check.attachments[workbook.name][0]==workbook.read_bytes()
for n,p in enumerate(check.pages[:layout['guidePages']],1):
    assert f'{n} / {layout["totalPages"]}' in p.extract_text(),n
for p in check.pages[-6:]:
    text=p.extract_text();assert 'DRAFT INVOICE' not in text and 'DRAFT PREVIEW' not in text
landscape=[i+1 for i,p in enumerate(check.pages) if float(p.mediabox.width)>float(p.mediabox.height)]
result={'guidePages':layout['guidePages'],'totalPages':len(check.pages),'pdfBytes':tmp.stat().st_size,'pdfSha256':hashlib.sha256(tmp.read_bytes()).hexdigest(),'finalOriginalInvoices':proof,'workbooks':[{'filename':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(ARTIFACTS.glob('*.xlsx'))],'nativeSixPageContentStreamsUnchanged':True,'nativeAttachmentBytesUnchanged':True,'finalAppendixContainsNoDraftMarks':True,'strictPdfReadPassed':True,'bodyPageNumbersVerified':True,'missingImages':0,'layoutOverflow':0,'landscapePages':landscape,'productionFinancialMutations':False,'trainingLifecycle':'Isolated and simulated; not evidence of bank transfer or genuine accountant approval'}
tmp.replace(out)
(DOCS/'bbs-manual-verification.json').write_text(json.dumps(result,indent=2)+'\n')
# Body-only intermediary is deliberately excluded from the deliverable: the public PDF has final annexes.
(DOCS/'bbs-manual-body.pdf').unlink()
print(json.dumps({'totalPages':len(check.pages),'landscapePages':len(landscape),'finalOriginalInvoices':3,'workbooks':len(result['workbooks']),'checks':'passed'}))
