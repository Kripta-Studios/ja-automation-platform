from pathlib import Path
import subprocess,json,datetime,shutil,re
out=Path('/home/kripta/ja-automation-platform-vps-hotfix/docs/evidence/operational-ux-followup-20260922/cache-after-deploy.json')
def run(*args):return subprocess.check_output(args,text=True)
def cache():return json.loads(run('curl','--silent','--show-error','--unix-socket','/var/run/docker.sock','http://localhost/system/df')).get('BuildCache') or []
def protected():
 return {'images':sorted(run('docker','image','ls','--no-trunc','--format','{{.ID}} {{.Repository}}:{{.Tag}}').splitlines()),'containers':sorted(run('docker','ps','-a','--format','{{.ID}} {{.Names}}').splitlines()),'volumes':sorted(run('docker','volume','ls','--format','{{.Name}}').splitlines()),'current':str(Path('/opt/jaautomation/current').resolve()),'releases':sorted(p.name for p in Path('/opt/jaautomation/releases').iterdir())}
records=cache();ids=sorted(r['ID'] for r in records if not r['InUse'] and not r['Shared'])
assert all(re.fullmatch('[a-z0-9]+',x) for x in ids)
state={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeCache':records,'authorizedIds':ids,'beforeDisk':shutil.disk_usage('/')._asdict(),'beforeProtected':protected(),'scope':'Only enumerated unused, unshared build cache; no images, volumes, containers or releases'}
command=['docker','builder','prune','--all','--force','--filter','id=^('+'|'.join(ids)+')$']
state['command']=command;out.write_text(json.dumps(state,indent=2)+'\n')
if ids:
 fresh={r['ID']:r for r in cache()}
 assert all(not fresh[x]['InUse'] and not fresh[x]['Shared'] for x in ids)
 result=subprocess.run(command,capture_output=True,text=True)
 state.update(exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr)
 assert result.returncode==0
else:state.update(exitCode=0,stdout='No unused cache to remove.')
state.update(afterCache=cache(),afterDisk=shutil.disk_usage('/')._asdict(),afterProtected=protected())
state['protectedUnchanged']=state['beforeProtected']==state['afterProtected'];state['allSelectedRemoved']=not set(ids)&{r['ID'] for r in state['afterCache']}
out.write_text(json.dumps(state,indent=2)+'\n')
assert state['protectedUnchanged'] and state['allSelectedRemoved']
print(json.dumps({'removedRecords':len(ids),'freeBytes':state['afterDisk']['free'],'protectedUnchanged':True,'result':state['stdout'].splitlines()[-1]}))
