from pathlib import Path
import subprocess,json,hashlib,datetime
repo=Path('/home/kripta/ja-automation-platform-vps-hotfix');out=repo/'docs/evidence/operational-ux-followup-20260922'
receipt=json.loads(Path('/tmp/ja-followup-release-receipt.json').read_text())
release=Path('/opt/jaautomation/current').resolve()
assert release.name=='ja-automation-'+receipt['sha256']
files=0; runtime=0
for line in (release/'RELEASE-MANIFEST.sha256').read_text().splitlines():
 expected,name=line.split('  ',1)
 assert hashlib.sha256((release/name).read_bytes()).hexdigest()==expected,name
 files+=1
 if name.startswith(('apps/','packages/','migrations/','deployment/','website/')):
  assert hashlib.sha256((repo/name).read_bytes()).hexdigest()==expected,name
  runtime+=1
containers=[json.loads(x) for x in subprocess.check_output(['docker','ps','--format','{{json .}}'],text=True).splitlines()]
old=json.loads((out/'services-before.json').read_text())
current={x['Names']:x for x in containers}
foreign=[]
for item in old['containers']:
 name=item['Names']
 if name.startswith('deployment-'):continue
 assert current[name]['ID']==item['ID'] and current[name]['State']=='running',name
 foreign.append(name)
for name in ['deployment-portal-1','deployment-site-1']:
 assert '(healthy)' in current[name]['Status'],name
assert current['deployment-jobs-1']['State']=='running'
pid=subprocess.check_output(['systemctl','show','caddy','--property=MainPID','--value'],text=True).strip()
assert pid==old['caddyPid']
units=['jaautomation-zip-deploy.path','caddy']
units+=subprocess.check_output(['systemctl','list-unit-files','jaautomation-*.timer','--no-legend','--no-pager'],text=True).splitlines()
units=[unit.split()[0] for unit in units]
for unit in units: assert subprocess.check_output(['systemctl','is-active',unit],text=True).strip()=='active',unit
logs=subprocess.check_output(['docker','logs','deployment-jobs-1'],text=True,stderr=subprocess.STDOUT)
cycles=[];errors=[]
for line in logs.splitlines():
 try: event=json.loads(line)
 except (json.JSONDecodeError,ValueError):continue
 if event.get('level')=='error':errors.append(event)
 if event.get('event')=='jobs.cycle':cycles.append(event)
assert len(cycles)>=2
assert not errors
for cycle in cycles:
 assert cycle['failed']==0 and cycle.get('outbox',{}).get('failed',0)==0 and cycle.get('outbox',{}).get('permanentlyFailed',0)==0
summary={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':str(release),'sourceTree':receipt['sourceTree'],'archiveSha256':receipt['sha256'],'manifestFilesVerified':files,'runtimeSourceFilesMatch':runtime,'unrelatedContainersPreserved':foreign,'caddyPidPreserved':pid,'healthyWebServices':2,'runningWorker':True,'activeUnits':units,'jobCyclesVerified':len(cycles),'jobErrors':len(errors),'lastTwoCycles':cycles[-2:]}
(out/'production-receipt.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
