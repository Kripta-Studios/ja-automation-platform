#!/usr/bin/env python3
from pathlib import Path
import subprocess, datetime

root = Path('.')
out = root / 'artifacts' / 'V3_COMPLETION_REPORT.md'
out.parent.mkdir(parents=True, exist_ok=True)

def sh(*args):
    try:
        return subprocess.run(args, check=False, capture_output=True, text=True).stdout.strip()
    except Exception as e:
        return f'<unavailable: {e}>'

matrix = Path('REQUIREMENTS_TRACEABILITY_MATRIX.md').read_text(encoding='utf-8') if Path('REQUIREMENTS_TRACEABILITY_MATRIX.md').exists() else '<missing>'
logs = sorted((root/'artifacts'/'quality-gates').glob('*')) if (root/'artifacts'/'quality-gates').exists() else []
latest = logs[-1] if logs else None

text = f"""# J&A V3 Completion Report\n\nGenerated: {datetime.datetime.now().isoformat()}\n\n## Git\n\n- Branch: `{sh('git','branch','--show-current')}`\n- HEAD: `{sh('git','rev-parse','HEAD')}`\n\n### Working tree\n\n```text\n{sh('git','status','--short') or '<clean>'}\n```\n\n## Latest quality-gate logs\n\n{latest if latest else '<none>'}\n\n## Traceability matrix snapshot\n\n{matrix}\n\n## Required manual additions before release\n\n- Independent spec-auditor verdict\n- Mobile/desktop QA verdict\n- Finance-integrity verdict\n- Security verdict\n- Data-leakage verdict if data-readiness changed\n- Sol/high integration-reviewer verdict\n"""
out.write_text(text, encoding='utf-8')
print(out)
