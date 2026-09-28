#!/usr/bin/env python3
"""Audit the authoritative Client Essential checklist.

Historical V3 RTM completeness is intentionally not the client-release gate.
Strict mode fails for unresolved Essential checklist states and unchecked Client
Essential DoD items. The conditional Offline/PWA section is reported but does
not fail until the go-live connectivity decision makes it applicable.
"""
from pathlib import Path
import argparse
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

parser = argparse.ArgumentParser()
parser.add_argument('--strict', action='store_true')
args = parser.parse_args()

path = Path('J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md')
if not path.exists():
    print('ERROR: Client Essential checklist not found', file=sys.stderr)
    sys.exit(2)

section = ''
unresolved = []
conditional = []
deferred = []
for line_number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
    if line.startswith('#'):
        section = line.lstrip('#').strip()
    if section == 'Legend':
        continue
    if line.startswith('- ❓') or (section.startswith('P. Offline/PWA') and ('⬜' in line or '❓' in line)):
        conditional.append((line_number, line.strip()))
        continue
    if '⏭' in line:
        deferred.append((line_number, line.strip()))
        continue
    if line.lstrip().startswith('- [ ]'):
        unresolved.append((line_number, line.strip()))
        continue
    if line.lstrip().startswith(('- ⬜', '- 🟨')) and 'not a blocker' not in line.lower():
        unresolved.append((line_number, line.strip()))

print(
    f'Client Essential checklist: {len(unresolved)} unresolved, '
    f'{len(conditional)} conditional, {len(deferred)} deferred.'
)
if unresolved:
    print('Unresolved Client Essential evidence:')
    for line_number, value in unresolved:
        print(f'  line {line_number}: {value}')
    if args.strict:
        sys.exit(1)

print('Client Essential checklist audit passed for selected mode.')
