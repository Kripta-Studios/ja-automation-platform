#!/usr/bin/env python3
"""Fail when mandatory traceability rows remain incomplete.

Usage:
  python scripts/audit-spec-coverage.py
  python scripts/audit-spec-coverage.py --strict

The parser intentionally stays simple: it reads Markdown table rows from
REQUIREMENTS_TRACEABILITY_MATRIX.md. In strict mode P0/P1 rows must be PASS,
or BLOCKED with a non-empty evidence/rationale field that contains the word
"external" or "credential"/"contract"/"prerequisite".
"""
from pathlib import Path
import argparse, re, sys

parser = argparse.ArgumentParser()
parser.add_argument('--strict', action='store_true')
args = parser.parse_args()

path = Path('REQUIREMENTS_TRACEABILITY_MATRIX.md')
if not path.exists():
    print('ERROR: traceability matrix not found', file=sys.stderr)
    sys.exit(2)

rows = []
for line in path.read_text(encoding='utf-8').splitlines():
    if not line.startswith('|') or line.startswith('|---') or 'Requirement | Priority' in line:
        continue
    cols = [c.strip() for c in line.strip('|').split('|')]
    if len(cols) < 5:
        continue
    rid, req, priority, status, evidence = cols[:5]
    if priority not in {'P0','P1','P2','P3'}:
        continue
    rows.append((rid, req, priority, status.upper(), evidence))

bad = []
for row in rows:
    rid, req, priority, status, evidence = row
    if args.strict and priority in {'P0','P1'}:
        if status == 'PASS':
            continue
        if status == 'BLOCKED' and re.search(r'external|credential|contract|prerequisite', evidence, re.I):
            continue
        bad.append(row)
    elif status in {'FAIL','OPEN'} and priority == 'P0':
        bad.append(row)

print(f'Parsed {len(rows)} traceability rows.')
if bad:
    print('Incomplete mandatory requirements:')
    for rid, req, priority, status, evidence in bad:
        print(f'  {rid} [{priority}] {status}: {req} :: {evidence}')
    sys.exit(1)
print('Traceability gate passed for selected mode.')
