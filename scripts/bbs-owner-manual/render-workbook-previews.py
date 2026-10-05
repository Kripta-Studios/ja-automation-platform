from pathlib import Path
from zipfile import ZipFile
from datetime import datetime, timedelta
from decimal import Decimal
import xml.etree.ElementTree as ET
import html, json, hashlib

ROOT = Path(__file__).resolve().parent
FIG = ROOT.parent.parent / 'docs/manuals/bbs-illustrated-en-v2'
EXPORTS = ROOT.parent.parent / 'docs/manuals/bbs-example-artifacts'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def load_workbook(path):
    sheets = {}
    with ZipFile(path) as z:
        assert z.testzip() is None
        names = [s.attrib['name'] for s in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS)]
        styles = [int(x.attrib.get('numFmtId', '0')) for x in ET.fromstring(z.read('xl/styles.xml')).findall('s:cellXfs/s:xf', NS)]
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(t.text or '' for t in s.findall('.//s:t', NS)) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        for i, name in enumerate(names, 1):
            rows = []
            for row in ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')).findall('s:sheetData/s:row', NS):
                cells = {}
                for c in row.findall('s:c', NS):
                    column = ''.join(x for x in c.attrib['r'] if x.isalpha())
                    kind = c.attrib.get('t')
                    raw = c.findtext('s:v', '', NS)
                    if kind == 'inlineStr': value = ''.join(t.text or '' for t in c.findall('.//s:t', NS))
                    elif kind == 's': value = shared[int(raw)]
                    else:
                        value = raw
                        style = styles[int(c.attrib.get('s', '0'))]
                        if raw and style == 164:
                            value = (datetime(1899, 12, 30) + timedelta(days=float(raw))).strftime('%Y-%m-%d')
                        elif raw and style == 165:
                            value = f'{Decimal(raw):,.2f}'
                    cells[column] = {'raw': raw, 'display': value, 'type': kind, 'ref': c.attrib['r']}
                rows.append({'number': int(row.attrib['r']), 'cells': cells})
            sheets[name] = rows
    return sheets

FIN = 'BBS-project-finance-2026-10-01_2026-10-05.xlsx'
EXP = 'BBS-expenses-2026-10-02_2026-10-03.xlsx'
AFTER = 'BBS-project-finance-after-lifecycle.xlsx'
books = {name: load_workbook(EXPORTS / name) for name in [FIN, EXP, AFTER]}
# Every view is a selected range of the original download. Values are never re-entered.
views = [
 ('71-xlsx-summary-economics', FIN, 'Summary', ['A','B','C'], [1]+list(range(11,25)), 'Summary · hours, costs and potential revenue'),
 ('72-xlsx-summary-cash', FIN, 'Summary', ['A','B','C'], [1]+list(range(25,31)), 'Summary · issued invoices, collection and forecast'),
 ('73-xlsx-labor-hours', FIN, 'Labor', ['A','B','C','D','E','F','G'], list(range(1,8)), 'Labor · actual and billable hours (rows 1–7)'),
 ('74-xlsx-labor-economics', FIN, 'Labor', ['A','B','C','H','I','J','K','L','M'], list(range(1,8)), 'Labor · rates and economics (rows 1–7)'),
 ('73b-xlsx-labor-hours', FIN, 'Labor', ['A','B','C','D','E','F','G'], [1]+list(range(8,14)), 'Labor · actual and billable hours (rows 8–13)'),
 ('74b-xlsx-labor-economics', FIN, 'Labor', ['A','B','C','H','I','J','K','L','M'], [1]+list(range(8,14)), 'Labor · rates and economics (rows 8–13)'),
 ('75-xlsx-expense-payers', FIN, 'Expenses', ['B','C','D','F','G','H','I','J','K'], None, 'Expenses · payer, receipt and reimbursement'),
 ('76-xlsx-expense-recovery', FIN, 'Expenses', ['B','C','D','L','M','N','O','P','Q','R','S','T'], None, 'Expenses · company cost and customer recovery'),
 ('77-xlsx-invoices', FIN, 'Invoices', ['A','B','C','D','E','F','G','H','I','J'], None, 'Invoices · draft totals and zero collections'),
 ('78-xlsx-invoice-expenses', FIN, 'Invoice expenses', ['A','C','E','F','G'], None, 'Invoice expenses · the three charged expense lines'),
 ('79-xlsx-unbilled', FIN, 'Unbilled WIP', ['A','B','C','E','F'], list(range(1,10)), 'Unbilled WIP · approved amounts not issued (rows 1–9)'),
 ('79b-xlsx-unbilled', FIN, 'Unbilled WIP', ['A','B','C','E','F'], [1]+list(range(10,17)), 'Unbilled WIP · approved amounts not issued (rows 10–16)'),
 ('80-xlsx-expense-register', EXP, 'Expenses', ['A','C','D','E','F','H','I','J','K'], None, 'Expense register export · the four source purchases'),
 ('82-xlsx-expense-reimbursement', EXP, 'Expenses', ['A','D','I','J','K','L','M','N'], None, 'Expense register export · reimbursement status'),
 ('81-xlsx-expense-totals', EXP, 'Totals by currency', None, None, 'Expense register export · totals by currency'),
 ('83-xlsx-after-cash', AFTER, 'Summary', ['A','B','C'], [1]+list(range(25,31)), 'After lifecycle · issued invoices and simulated collections'),
 ('84-xlsx-after-invoices', AFTER, 'Invoices', ['A','B','C','D','E','F','G','H','I','J'], None, 'After lifecycle · three confirmed invoice states'),
 ('85-xlsx-after-reimbursements', AFTER, 'Expenses', ['B','C','D','F','G','H','I','J','K'], None, 'After lifecycle · recorded simulated reimbursements'),
]

style = '''*{box-sizing:border-box}body{margin:0;background:#eaf0f4;font:20px/1.30 Arial,sans-serif;color:#182b40}.sheet-preview{width:1450px;background:white;padding:22px;border:1px solid #aabcc8}.file{background:#17674f;color:white;padding:14px 18px;font-size:20px;font-weight:bold}.label{font-size:23px;margin:16px 0 7px}.scope{font-size:16px;color:#526575;margin:6px 0 14px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #c7d2dc;padding:9px 8px;vertical-align:top;overflow-wrap:anywhere}thead th{background:#e6edf2;font-size:14px;color:#48616f;text-align:center}.row-number{width:44px;color:#637a85;background:#e6edf2;text-align:center;font-size:14px}.head td{background:#24251f;color:white;font-weight:bold;font-size:18px}.tabs{display:flex;gap:7px;flex-wrap:wrap;background:#e8efeb;padding:10px;font-size:15px}.tab{padding:6px 12px;background:#f7faf8;border:1px solid #c0cec5}.active{background:white;border-bottom:3px solid #17674f;font-weight:bold}.disclosure{font-size:15px;color:#4c616b;padding-top:11px}'''
parts=[]; metadata=[]
for key, file, sheet, columns, rownums, title in views:
    data=books[file][sheet]
    if columns is None: columns=list(data[0]['cells'])
    selected=[r for r in data if rownums is None or r['number'] in rownums]
    out=f'<section class="sheet-preview" id="{key}"><div class="file">{html.escape(file)}</div><h1 class="label">{html.escape(title)}</h1><p class="scope">Worksheet: {html.escape(sheet)} · Original column letters and row numbers · Selected columns: {", ".join(columns)}</p><table><thead><tr><th class="row-number"></th>'+''.join('<th>'+c+'</th>' for c in columns)+'</tr></thead><tbody>'
    for r in selected:
        out+='<tr'+(' class="head"' if r['number']==1 else '')+'><th class="row-number">'+str(r['number'])+'</th>'+''.join('<td>'+html.escape(r['cells'].get(c,{}).get('display',''))+'</td>' for c in columns)+'</tr>'
    out+='</tbody></table><div class="tabs">'+''.join('<span class="tab'+(' active' if name==sheet else '')+'">'+html.escape(name)+'</span>' for name in books[file])+'</div><div class="disclosure">Read-only browser preview of the actual downloaded XLSX. This is not Microsoft Excel. Blank cells remain blank; dates and decimal amounts use the workbook formats.</div></section>'
    parts.append(out)
    metadata.append({'key':key,'file':file,'sheet':sheet,'columns':columns,'originalRows':[r['number'] for r in selected],'title':title})
output='<!doctype html><html lang="en"><meta charset="utf-8"><title>BBS · Actual spreadsheet export previews</title><style>'+style+'</style><body>'+''.join(parts)+'</body></html>'
(FIG/'workbook-previews.html').write_text(output)
manifest={'downloads':[{'file':name,'sha256':hashlib.sha256((EXPORTS/name).read_bytes()).hexdigest(),'worksheets':list(sheets)} for name,sheets in books.items()],'views':metadata,'previewMethod':'OpenXML values and number formats from original downloads rendered in an offline browser; no spreadsheet cells modified.'}
(FIG/'workbook-previews.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'workbooks':len(books),'previews':len(views),'originalFilesUnmodified':True}))
