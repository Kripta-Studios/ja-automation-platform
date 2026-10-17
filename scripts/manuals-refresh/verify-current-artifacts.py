"""Verify the 12 current manuals and preservation of Owner invoice annex evidence."""
from pathlib import Path
from hashlib import sha256
import json
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/manuals'
EVIDENCE = ROOT / 'docs/evidence/sota-ux-20261017/manuals'
BASELINE = json.loads((EVIDENCE / 'owner-baseline.json').read_text())

ASSETS = [
    'BBS_Auditor_Manual_EN.pdf',
    'BBS_Crew_Chief_Manual_EN.pdf',
    'BBS_External_Technician_Manual_EN.pdf',
    'BBS_Finance_Manual_EN.pdf',
    'BBS_Owner_Manual_EN.pdf',
    'BBS_Project_Manager_Manual_EN.pdf',
    'BBS_Supplier_Coordinator_Manual_EN.pdf',
    'BBS_Worker_Manual_EN.pdf',
    'BBS_Project_to_Client_Invoices_Guide_EN.pdf',
    'Project_to_Invoice_Quick_Guide_EN.pdf',
    'Digital_Workers.pdf',
    'Role_Workflows.pdf',
]

assets = []
readers = {}
for filename in ASSETS:
    path = DOCS / filename
    blob = path.read_bytes()
    reader = PdfReader(path, strict=True)
    texts = [(page.extract_text() or '').strip() for page in reader.pages]
    assert texts and all(texts), f'Blank or unreadable PDF page: {filename}'
    readers[filename] = reader
    assets.append({
        'filename': filename,
        'pages': len(reader.pages),
        'landscapePages': [
            index + 1
            for index, page in enumerate(reader.pages)
            if float(page.mediabox.width) > float(page.mediabox.height)
        ],
        'bytes': len(blob),
        'sha256': sha256(blob).hexdigest(),
        'strictRead': 'PASS',
        'textOnEveryPage': 'PASS',
    })

extended_name = 'BBS_Project_to_Client_Invoices_Guide_EN.pdf'
combined_name = 'BBS_Owner_Manual_EN.pdf'
baseline_guide = BASELINE[extended_name]
baseline_combined = BASELINE[combined_name]
extended = readers[extended_name]
combined = readers[combined_name]
assert len(extended.attachments) == 6
assert len(combined.attachments) == 6

def attachment_hashes(reader):
    return {
        name: [sha256(data).hexdigest() for data in contents]
        for name, contents in sorted(reader.attachments.items())
    }

expected_attachments = baseline_guide['attachments']
assert attachment_hashes(extended) == expected_attachments
assert attachment_hashes(combined) == expected_attachments
assert attachment_hashes(extended) == attachment_hashes(combined)

def page_hashes(reader):
    return [
        sha256(page.get_contents().get_data()).hexdigest()
        for page in reader.pages[-6:]
    ]

expected_annex = [page['contents_sha256'] for page in baseline_guide['annex_pages']]
assert page_hashes(extended) == expected_annex
assert page_hashes(combined) == expected_annex

result = {
    'revision': '2026-10-17',
    'status': 'PASS',
    'currentPdfCount': len(assets),
    'assets': assets,
    'ownerAnnexPreservation': {
        'baselineGuidePageCount': baseline_guide['pages'],
        'baselineCombinedOwnerPageCount': baseline_combined['pages'],
        'currentGuidePageCount': len(extended.pages),
        'currentCombinedOwnerPageCount': len(combined.pages),
        'baselineAnnexContentSha256': expected_annex,
        'currentGuideAnnexUnchanged': True,
        'currentCombinedOwnerAnnexUnchanged': True,
        'sixNativeAttachmentsUnchanged': True,
        'attachmentSha256': expected_attachments,
    },
    'currentBuild': [
        'python scripts/bbs-owner-manual/build.py',
        'node scripts/bbs-owner-manual/render.mjs',
        'python scripts/bbs-owner-manual/assemble.py',
        'node scripts/bbs-role-manuals/build.mjs',
        'python scripts/bbs-role-manuals/assemble-owner.py',
        'python scripts/bbs-role-manuals/verify.py',
        'node docs/manuals/render-current-guide.mjs Project_to_Invoice_Quick_Guide_EN',
        'node docs/manuals/render-current-guide.mjs Digital_Workers',
        'node scripts/manuals-refresh/render-html-guide.mjs Role_Workflows',
        'python scripts/manuals-refresh/verify-current-artifacts.py',
    ],
}
(EVIDENCE / 'current-artifacts.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({
    'status': result['status'],
    'currentPdfCount': len(assets),
    'pdfs': [{'filename': item['filename'], 'pages': item['pages'], 'sha256': item['sha256']} for item in assets],
    'ownerAnnexPreservation': result['ownerAnnexPreservation'],
}, indent=2))
