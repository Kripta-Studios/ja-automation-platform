import subprocess,os,tempfile,pathlib,zipfile,hashlib,json,datetime
root=pathlib.Path('/home/kripta/ja-automation-platform-vps-hotfix')
stage=pathlib.Path(tempfile.mkdtemp(prefix='ja-operational-ux-release-'))
env=dict(os.environ,GIT_INDEX_FILE=str(stage/'index'))
paths=['.dockerignore','.env.example','.gitignore','.node-version','.nvmrc','README.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','eslint.config.js','prettier.config.mjs','vitest.config.ts','playwright.config.ts','playwright.mvp.config.ts','website','apps','packages','migrations','deployment','docs','scripts','tests']
def git(*args): return subprocess.check_output(['git',*args],cwd=root,env=env,text=True).strip()
git('read-tree','HEAD');git('add','--',*paths)
tree=git('write-tree');commit=git('rev-parse','HEAD')
archive=stage/'jaautomation-operational-ux-followup-20260923.zip';prefix='jaautomation-operational-ux/'
git('archive','--format=zip','--prefix='+prefix,'--output='+str(archive),tree,'--',*paths)
with zipfile.ZipFile(archive,'a',compression=zipfile.ZIP_DEFLATED) as z:
 meta=f'release=operational-ux-followup-20260923\ncommit={commit}\nsource_tree={tree}\nsource_snapshot=reviewed-worktree\nnode=24.19.0\npnpm=11.22.0\ncreated_at={datetime.datetime.now(datetime.timezone.utc).isoformat()}\n'
 z.writestr(prefix+'RELEASE-BUILD.txt',meta)
 manifest='\n'.join(hashlib.sha256(z.read(info)).hexdigest()+'  '+info.filename[len(prefix):] for info in z.infolist() if not info.is_dir())+'\n'
 z.writestr(prefix+'RELEASE-MANIFEST.sha256',manifest)
 assert z.testzip() is None
receipt={'path':str(archive),'sourceTree':tree,'baseCommit':commit,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size}
pathlib.Path('/tmp/ja-followup-release-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
