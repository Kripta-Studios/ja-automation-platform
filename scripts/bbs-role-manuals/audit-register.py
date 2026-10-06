"""Initialize the user-supplied 6 October readiness correction register."""
from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[2]
groups = {
    'S': ('shared', [
        'Recipient first login, activation and recovery',
        'Task bookmarks and unambiguous page references',
        'Separate operating instructions from testing provenance',
        'Reproducible trainer setup and resettable lesson scopes',
        'Source-specific operational review authority matrix',
        'Verify weekly linked-correction submission by role and state',
        'Resolve finalized-compensation correction receiving handoff',
        'Expense and report correction state procedures',
        'Executable own-account security and availability reference',
        'Release-specific role capability and validation inventory']),
    'ET': ('external-technician', [
        'First shift before advanced planning', 'Needs note operational response',
        'Replace transient Saving capture', 'Show actual Approved correction outcome',
        'Scope historical 2.75-hour export', 'Readable technical output and evidence upload']),
    'SC': ('supplier-coordinator', [
        'Saved personnel roster and coverage', 'Exact Add technician control and required fields',
        'Readable team batch and correction controls', 'Matching corrected Approved CSV',
        'Complete own expense and report output cycle', 'Consolidate planning restrictions']),
    'CC': ('chief', [
        'Complete project, receipt and save controls', 'Supported allocation and submission order',
        'Mistaken correction and receipt split recovery', 'Own report and worker statement outputs',
        'Entry-only scope and separately granted review variant']),
    'WK': ('worker', [
        'First shift before detailed planning', 'Complete Save draft button',
        'Unlocked ordinary correction exercise', 'Weekly expense evidence and returned correction',
        'Own Daily and Technical PDF generation', 'Keep Ready statement and isolate historical failure']),
    'AU': ('auditor', [
        'Complete invoice-to-source reconciliation', 'Readable amount, state and readiness columns',
        'Invoice outstanding versus customer net credit balance', 'Populated read-only Accounting Pack',
        'Full event chain and finding handoff', 'Supported direct read navigation']),
    'PM': ('manager', [
        'Actual assignment and saved membership screenshots', 'Reject versus Needs changes decisions',
        'Actual Approved Technical report outcome', 'Completed customer-report receiving handoff',
        'Cumulative cancellation coverage', 'Document audience versus sensitivity',
        'Actionable notification and separate read state', 'Precise role-safe own-work references']),
    'FN': ('finance', [
        'Exact Record Finance review before and after', 'Dated agreement and new stream setup',
        'Normal source-based invoice wizard and final issue', 'Customer period report and sign-off',
        'Credit, Debit and Correction decision and reconciliation', 'Finalized obligation amendment boundary',
        'Full reimbursement and timestamp limitations', 'Actual export date selection and snapshot scope',
        'Successful Finance Accounting Pack cycle', 'Late work and closure support boundary']),
    'OW': ('owner', [
        'Integrated master task contents and course navigation', 'Generated stable prose cross-references',
        'Owner checks versus support and employee own access', 'Review grant, revoke and verification',
        'Clean project and genuine issuer prerequisite setup', 'Enabled alternative commercial mechanisms',
        'Consistent verified weekly correction instructions', 'Current populated technical-detail output',
        'Neutral numbering example and approved-input checklist', 'Credit allocation or refund supported boundary',
        'Accurate historical production versus isolated provenance', 'Actual finance export period controls',
        'Populated project closeout and retained obligations', 'Exact portfolio Accounting scope',
        'Current Auditor, security and capability references']),
}
p1 = {'S01','S04','S05','S06','S07','S08','ET04','SC02','SC05',
      'CC02','CC04','CC05','WK03','WK04','WK05','AU01','AU03','AU04',
      'PM01','PM03','PM04','FN01','FN02','FN03','FN04','FN05','FN06','FN07','FN09',
      'OW01','OW02','OW04','OW05','OW07','OW10','OW11','OW13'}
items = [dict(id=f'{prefix}{i:02}', role=role, priority='P1' if f'{prefix}{i:02}' in p1 else 'P2',
              finding=title, status='open', sections=[], evidence=[], validation=None)
         for prefix, (role, titles) in groups.items() for i, title in enumerate(titles, 1)]
assert len(items) == 72 and len(p1) == 37
path = root/'docs/evidence/bbs-readiness-20261006/correction-register.json'
path.parent.mkdir(parents=True, exist_ok=True)
if path.exists():
    previous = {item['id']: item for item in json.loads(path.read_text())['items']}
    items = [previous.get(item['id'], item) for item in items]
baseline = [dict(filename=p.name, sha256=hashlib.sha256(p.read_bytes()).hexdigest())
            for p in sorted((root/'docs/manuals').glob('BBS_*_Manual_EN.pdf'))]
path.write_text(json.dumps(dict(auditDate='2026-10-06', source='User-supplied 608-page readiness audit',
                               scope='72 documentation actions; not 72 independent software defects',
                               baseline=baseline, items=items), indent=2)+'\n')
print(f'{len(items)} findings, {len(p1)} P1 actions recorded.')
