#!/usr/bin/env python3
from pathlib import Path
import subprocess, datetime

root = Path('.')
out = root / 'artifacts' / 'CLIENT_ESSENTIAL_COMPLETION_REPORT.md'
out.parent.mkdir(parents=True, exist_ok=True)

def sh(*args):
    try:
        return subprocess.run(args, check=False, capture_output=True, text=True).stdout.strip()
    except Exception as exc:
        return f'<unavailable: {exc}>'

checklist_path = Path('J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md')
checklist = checklist_path.read_text(encoding='utf-8') if checklist_path.exists() else '<missing>'
logs = sorted((root / 'artifacts' / 'quality-gates').glob('*')) if (root / 'artifacts' / 'quality-gates').exists() else []
latest = logs[-1] if logs else None

text = f"""# J&A Client Essential Completion Report

Generated: {datetime.datetime.now().isoformat()}

## Git

- Branch: `{sh('git', 'branch', '--show-current')}`
- HEAD: `{sh('git', 'rev-parse', 'HEAD')}`

### Working tree

```text
{sh('git', 'status', '--short') or '<clean>'}
```

## Latest quality-gate logs

{latest if latest else '<none>'}

## Client Essential checklist snapshot

{checklist}

## Required independent evidence before CLIENT READY

- Client Essential spec-auditor verdict
- Worker/PM/Finance/Owner responsive browser verdict
- Finance-integrity verdict
- Security/RBAC/private-file verdict
- Migration/integrity and realistic backup/restore evidence
- Sol integration-reviewer verdict

ML/data-leakage review is required only if explicitly commissioned post-core ML/data-readiness work or existing point-in-time records changed.
"""
out.write_text(text, encoding='utf-8')
print(out)
