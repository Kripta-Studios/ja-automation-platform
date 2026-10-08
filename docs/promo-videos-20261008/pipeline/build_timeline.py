"""Builds timeline.json / timeline.js for compose.html (all times in seconds)."""
import json

U = 'j-aautomation.com/j-aautomation/app'
P = '01a10c51-a391-7288-aad1-cb38be43f496'
eb = json.load(open('rec/login/email-box.json'))
k = 4 / 3

segments = [
    dict(type='title', start=0, end=4, enter='fade', tin=.8, kicker='J&amp;A Automation', lines=['Field crews.', 'Projects.', '*Finance.*'], size=124, stagger=.22),
    dict(type='title', start=4, end=8, logo=True, lines=['One platform to run', 'every *project*.'], size=104, sub='From the plant floor to the final invoice.'),

    dict(type='scene', start=8, end=16, rec='login', url=f'{U}/login', enter='zoom',
         remap=[[0, 1.6], [6.6, 8.2], [6.62, 16.7], [8.6, 18.8]],
         blur=[dict(x=eb['x'] * k, y=eb['y'] * k, w=eb['width'] * k, h=eb['height'] * k, **{'from': 2.5, 'to': 8.6})],
         zoom=[[1.6, 1, 960, 540], [3.0, 1.3, 1350, 560], [8.2, 1.3, 1350, 560], [16.7, 1, 960, 540]],
         chip='Secure access', title='Sign in. Get to work.', sub='Work email, passkeys and optional MFA. Invitation-only workspaces.', captionRight=False),
    dict(type='scene', start=16, end=25, rec='dashboard', url=f'{U}', **{'from': 9.4},
         zoom=[[11.2, 1, 960, 540], [12.6, 1.45, 420, 330], [18.5, 1.45, 420, 330]],
         chip='Navigation assistant', title='Find any task in seconds', sub='Type what you need. 120 guided workflows, one shortcut away.', captionRight=True),
    dict(type='scene', start=25, end=33, rec='project', url=f'{U}/projects/{P}', **{'from': 0.4},
         zoom=[[0.8, 1, 960, 540], [2.0, 1.28, 900, 420], [4.3, 1.28, 900, 420], [5.4, 1, 960, 540]],
         chip='Projects', title='Every project, in context', sub='Hours, team, reports, contribution and billing on one page.', captionRight=True),
    dict(type='scene', start=33, end=41, rec='planning', url=f'{U}/planning', remap=[[0, 0.5], [3.5, 4.6], [8, 11.5]],
         chip='Planning', title='Plan your crews ahead', sub='Publish assignments by site and skill. Crews see them instantly.', captionRight=True),
    dict(type='phone', start=41, end=53, rec='mobile', remap=[[0, 1.0], [4.5, 7.2], [12, 19.6]],
         chip='Field crews', title='Built for<br>the field', sub='The same workspace on any phone.',
         bullets=['Log hours, expenses &amp; receipts', 'See upcoming assignments', 'Capture offline, sync later']),
    dict(type='scene', start=53, end=61, rec='report', url=f'{U}/reports/01a11c09-aca5-76b9-adc3-ffdcd24bc168', **{'from': 0.6}, speed=1.75,
         chip='Daily &amp; PLC reports', title='Evidence your customers trust', sub='Diagnosis, change, validation and rollback, with print-ready PDFs.', captionRight=True),
    dict(type='scene', start=61, end=67, rec='approvals', url=f'{U}/approvals', **{'from': 0.2}, speed=.75,
         zoom=[[1.6, 1, 960, 540], [2.8, 1.25, 700, 760], [4.3, 1.25, 900, 760]],
         chip='Approvals', title='Review. Approve. Done.', sub='Two-stage control: operations first, then finance.', captionRight=True),
    dict(type='scene', start=67, end=75, rec='finance', url=f'{U}/finance?view=economic', **{'from': 3.4},
         zoom=[[4.6, 1, 960, 540], [6.2, 1.32, 1060, 430], [11.4, 1.32, 1060, 430]],
         chip='Finance', title='Live project economics', sub='Margin, direct cost, labour and hours, updated as work is approved.', captionRight=True),
    dict(type='scene', start=75, end=85, rec='billing', url=f'{U}/billing', remap=[[0, 0.8], [3.2, 5.6], [10, 17.6]],
         chip='Billing', title='From timesheet to invoice', sub='Draft, approve, issue and collect. Issued invoices stay immutable.', captionRight=True),
    dict(type='scene', start=85, end=91, rec='audit', url=f'{U}/audit', **{'from': 0.5},
         zoom=[[0.5, 1, 960, 540], [2.0, 1.2, 760, 520], [6.8, 1.2, 760, 600]],
         chip='Compliance', title='Every change on the record', sub='Append-only security and finance audit, plus a read-only auditor role.', captionRight=True),
    dict(type='scene', start=91, end=98, rec='language', url=f'{U}', **{'from': 0.6}, speed=.8,
         zoom=[[0.6, 1, 960, 540], [1.8, 1.3, 760, 400], [5.6, 1.3, 760, 400]],
         chip='Multilingual', title='English · Español · Português', sub='Switch languages instantly. Reports and PDFs follow.', captionRight=True),

    dict(type='roles', start=98, end=104, heading='One platform. <span class="red">Every role.</span>', items=[
        ['shots/role-owner.jpg', 'Owner'], ['shots/role-finance.jpg', 'Finance'], ['shots/role-project-manager.jpg', 'Project manager'], ['shots/role-auditor.jpg', 'Auditor'],
        ['shots/role-crew-chief.jpg', 'Crew chief'], ['shots/role-supplier-coordinator.jpg', 'Supplier coordinator'], ['shots/role-external-technician.jpg', 'External technician'], ['shots/role-worker-2.jpg', 'Field worker']]),
    dict(type='stats', start=104, end=112, heading='Serious depth, <span class="red">ready today</span>', items=[
        [237, 'production capabilities'], [120, 'guided tasks'], [8, 'role workspaces'], [3, 'languages']], sub='190 audited actions · 52 API endpoints · fully mapped'),
]

# fast montage on the drop (112-124): 8 cuts of 1.5 s
cuts = [('billing', 9.5), ('mobile', 9.0), ('finance', 7.5), ('planning', 9.5), ('report', 9.0), ('approvals', 3.6), ('dashboard', 15.0), ('project', 15.5)]
t = 112.0
for rec, frm in cuts:
    seg = dict(type='scene', start=t, end=t + 1.5, rec=rec, url=U, enter='cut', tin=.01, winW=1720, **{'from': frm})
    if rec == 'mobile':
        seg = dict(type='phone', start=t, end=t + 1.5, rec='mobile', enter='cut', tin=.01, **{'from': frm}, phoneX=740, title='', chip='')
    if rec == 'billing':
        seg['blur'] = []
    segments.append(seg)
    t += 1.5

segments.append(dict(type='title', start=124, end=133, logo=True, enter='zoom', tin=.6, noFadeOut=True,
                     lines=['Run every project', 'with *confidence*.'], size=100, url='j-aautomation.com', cta='Book a live demo'))

# crossfade: keep each outgoing segment alive while the next one fades in
for a, b in zip(segments, segments[1:]):
    if b.get('enter') != 'cut' and abs(a['end'] - b['start']) < 1e-6:
        a['end'] = b['start'] + b.get('tin', .45)

tl = dict(duration=133.0, flashes=[8.0, 112.0, 124.0], segments=segments)
json.dump(tl, open('timeline.json', 'w'), indent=1)

recs = {}
for s in segments:
    if 'rec' in s and s['rec'] not in recs:
        d = json.load(open(f"rec/{s['rec']}/index.json"))
        recs[s['rec']] = dict(frames=[[f['t'], f['file']] for f in d['frames']])
with open('timeline.js', 'w') as f:
    f.write('window.TIMELINE = ' + json.dumps(tl) + ';\nwindow.RECORDINGS = ' + json.dumps(recs) + ';\n')
print('segments', len(segments), 'duration', tl['duration'])
