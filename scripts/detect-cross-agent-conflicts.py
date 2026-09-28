#!/usr/bin/env python3
"""Check a worktree diff against a declared role's owned path prefixes.

This is a guardrail, not a perfect policy engine. Refine
orchestration/domain-ownership.example.json after the architect maps the actual
post-decomposition ownership.

Example:
  python scripts/detect-cross-agent-conflicts.py --role finance_reporting --base HEAD~1
"""
import argparse, json, subprocess, sys
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--role', required=True)
p.add_argument('--base', default='HEAD')
p.add_argument('--ownership', default='orchestration/domain-ownership.example.json')
a = p.parse_args()

owners = json.loads(Path(a.ownership).read_text(encoding='utf-8'))
allowed = owners.get(a.role)
if not allowed:
    print(f'No ownership mapping for role {a.role!r}', file=sys.stderr)
    sys.exit(2)

cmd = ['git','diff','--name-only',a.base]
proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
files = [x.strip().replace('\\','/') for x in proc.stdout.splitlines() if x.strip()]
outside = [f for f in files if not any(f.startswith(prefix) for prefix in allowed)]

print(f'Role: {a.role}')
print(f'Changed files: {len(files)}')
if outside:
    print('Outside declared ownership:')
    for f in outside:
        print('  ' + f)
    sys.exit(1)
print('Ownership check passed.')
