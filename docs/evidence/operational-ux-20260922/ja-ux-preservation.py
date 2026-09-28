from pathlib import Path
import hashlib,sqlite3,json,datetime,sys
root=Path('/var/lib/jaautomation');db=sqlite3.connect('file:'+str(root/'data/jaautomation.sqlite')+'?mode=ro',uri=True);db.execute('BEGIN')
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'integrity':db.execute('PRAGMA integrity_check').fetchone()[0],'foreignKeys':len(db.execute('PRAGMA foreign_key_check').fetchall()),'tables':{}}
for table in ['invoice','invoice_line','payment','finance_snapshot','finance_internal_cost_snapshot','invoice_commercial_source_manifest','accounting_pack_revision_snapshot','worker_compensation_payment_event']:
 rows=db.execute('SELECT * FROM '+table+' ORDER BY rowid').fetchall();out['tables'][table]={'rows':len(rows),'sha256':hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False,default=str).encode()).hexdigest()}
db.close();files=[]
for p in sorted((root/'files').rglob('*')):
 if p.is_file():files.append((str(p.relative_to(root/'files')),hashlib.sha256(p.read_bytes()).hexdigest()))
out['privateFiles']={'count':len(files),'sha256':hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest()}
Path(sys.argv[1]).write_text(json.dumps(out,indent=2)+'\n')
if len(sys.argv)>2:
 before=json.loads(Path(sys.argv[2]).read_text());assert before['tables']==out['tables'];assert before['privateFiles']==out['privateFiles'];assert out['integrity']=='ok' and out['foreignKeys']==0
print(json.dumps({'integrity':out['integrity'],'foreignKeys':out['foreignKeys'],'tables':len(out['tables']),'privateFiles':len(files),'preserved':len(sys.argv)>2}))
