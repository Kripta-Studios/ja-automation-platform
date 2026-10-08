"""Builds timeline.json / timeline.js for compose.html (all times in seconds)."""
import json

U = 'j-aautomation.com/j-aautomation/app'
P = '01a10c51-a391-7288-aad1-cb38be43f496'
eb = json.load(open('rec/login/email-box.json'))
k = 4 / 3

segments = [
    dict(type='title', start=0, end=4.2, enter='fade', tin=.7, kicker='EVOCON SOLUTIONS', lines=['Field work.', 'Evidence.', '*Invoices.*'], size=116, stagger=.2),
    dict(type='title', start=4.2, end=9, logo=True, lines=['Built for industrial', 'service *teams*.'], size=92, sub='One workflow, from the hours worked to the invoice sent.'),

    dict(type='scene', sharp=True, start=9, end=15.5, rec='login', enter='fade', tin=.4,
         remap=[[0, 1.6], [5.2, 8.2], [5.3, 16.7], [6.5, 18.6]],
         blur=[dict(x=eb['x'] * k, y=eb['y'] * k, w=eb['width'] * k, h=eb['height'] * k, **{'from': 2.2, 'to': 8.4})],
         zoom=[[1.6, 1, 960, 540], [3.2, 1.25, 1350, 560], [8.2, 1.25, 1350, 560], [16.7, 1, 960, 540]],
         chip='Secure access', title='Every role signs in', sub='Work email, passkeys and optional MFA. Invitation-only.'),
    dict(type='scene', sharp=True, start=15.5, end=22, rec='dashboard', enter='fade', tin=.35, **{'from': 10.6},
         zoom=[[11.2, 1, 960, 540], [13, 1.35, 460, 360], [18.4, 1.35, 460, 360]],
         chip='Task finder', title='Describe the task', sub='It opens the right form, in your language. You still review and save.'),
    dict(type='scene', sharp=True, start=22, end=28, rec='project', enter='fade', tin=.35, **{'from': 0.6},
         zoom=[[0.8, 1, 960, 540], [2.2, 1.2, 980, 400], [5, 1.2, 980, 400], [6.2, 1, 960, 540]],
         chip='One project', title='Hours, crew, reports, money', sub='The same project holds the fieldwork and the commercial result.'),
    dict(type='scene', sharp=True, start=28, end=40, rec='units', enter='fade', tin=.4, **{'from': 4.2},
         zoom=[[4.2, 1, 1000, 520], [6.5, 1.22, 1180, 500], [12.5, 1.22, 1180, 560]],
         chip='Per-person terms', title='Hourly, daily and weekly', sub='7.5 hours worked. One day and one week, each billed once. Three agreements, one invoice.'),
    dict(type='scene', sharp=True, start=40, end=47, rec='finance', enter='fade', tin=.35, **{'from': 4.2},
         zoom=[[4.6, 1, 960, 540], [6.4, 1.28, 1080, 430], [11, 1.28, 1080, 430]],
         chip='Economics', title='Margin is not cash', sub='Invoiced, unbilled, cost and contribution stay separate, each traced to its source.'),
    dict(type='scene', sharp=True, start=47, end=54, rec='approvals', enter='fade', tin=.35, **{'from': 0.4}, speed=.8,
         zoom=[[1.2, 1, 960, 540], [2.8, 1.2, 760, 700], [4.2, 1.2, 900, 740]],
         chip='Two reviews', title='Confirm the work first', sub='Operations approves the facts. Finance decides the treatment. The customer accepts a specific version.'),
    dict(type='scene', sharp=True, start=54, end=62, rec='report', enter='fade', tin=.35, **{'from': 0.8}, speed=1.6,
         chip='Technical record', title='What changed, and why', sub='Problem, diagnosis, change, validation and rollback. Kept with the project, not lost in a comment.'),
    dict(type='scene', sharp=True, start=62, end=68.5, rec='planning', enter='fade', tin=.35, remap=[[0, 0.8], [3, 5], [6.5, 12]],
         chip='Crews', title='One lead, every person visible', sub='A chief can record the crew. Each worker keeps their own hours, pay and customer terms.'),
    dict(type='phone', start=68.5, end=78, rec='mobile', remap=[[0, 1.2], [4, 7.4], [9.5, 18]],
         chip='In the field', title='The same workspace<br>on a phone', sub='A plan never becomes actual hours.',
         bullets=['Log the hours you really worked', 'See the assignments published for you', 'Capture offline, sync when you reconnect']),
    dict(type='scene', sharp=True, start=78, end=84, rec='audit', enter='fade', tin=.35, **{'from': 0.6},
         zoom=[[0.6, 1, 960, 540], [2.2, 1.15, 800, 520], [6.5, 1.15, 800, 600]],
         chip='Traceable', title='The history stays', sub='Corrections explain the original entry. Issued invoices are adjusted, not rewritten.'),
    dict(type='scene', sharp=True, start=84, end=90, rec='language', enter='fade', tin=.35, **{'from': 0.8}, speed=.85,
         zoom=[[0.8, 1, 960, 540], [2, 1.25, 800, 380], [5.4, 1.25, 800, 380]],
         chip='Three languages', title='English, Español, Português', sub='The workspace follows the person. Reports can follow too.'),
    dict(type='roles', start=90, end=97, heading='A workspace for <span class="red">every role</span>', items=[
        ['shots/role-owner.jpg', 'Owner'], ['shots/role-finance.jpg', 'Finance'], ['shots/role-project-manager.jpg', 'Project manager'], ['shots/role-auditor.jpg', 'Auditor'],
        ['shots/role-crew-chief.jpg', 'Crew chief'], ['shots/role-supplier-coordinator.jpg', 'Supplier coordinator'], ['shots/role-external-technician.jpg', 'External technician'], ['shots/role-worker-2.jpg', 'Field worker']]),
    dict(type='title', start=97, end=109, enter='fade', tin=.4, kicker='WHY TEAMS PAY FOR THIS', size=64, stagger=.16,
         lines=['*Per-person* commercial terms', 'Expenses with separate meanings', 'Crews that stay individual', 'Evidence tied to the invoice'],
         sub='Built around how industrial service work is actually billed.'),
]
cuts = [('units', 8.5), ('finance', 8), ('report', 8), ('approvals', 3.8), ('mobile', 10), ('planning', 10), ('dashboard', 15), ('project', 16)]
t = 109.0
for rec, frm in cuts:
    if rec == 'mobile':
        segments.append(dict(type='phone', start=t, end=t+1.5, rec='mobile', enter='cut', tin=.01, **{'from': frm}, phoneX=740, title='', chip=''))
    else:
        segments.append(dict(type='scene', sharp=True, start=t, end=t+1.5, rec=rec, enter='cut', tin=.01, **{'from': frm}))
    t += 1.5
segments.append(dict(type='title', start=121, end=133, logo=True, enter='fade', tin=.5, noFadeOut=True,
                     lines=['Run every project', 'with *confidence*.'], size=92,
                     sub='Built for J&amp;A Automation. Offered by Evocon Solutions.',
                     url='alvaro.schwiedop@evocon-solutions.com'))

tl = dict(brand='evocon', duration=133.0, flashes=[9.0, 28.0, 121.0], segments=segments)
json.dump(tl, open('timeline.json', 'w'), indent=1)

recs = {}
for s in segments:
    if 'rec' in s and s['rec'] not in recs:
        d = json.load(open(f"rec/{s['rec']}/index.json"))
        recs[s['rec']] = dict(frames=[[f['t'], f['file']] for f in d['frames']])
with open('timeline.js', 'w') as f:
    f.write('window.TIMELINE = ' + json.dumps(tl) + ';\nwindow.RECORDINGS = ' + json.dumps(recs) + ';\n')
print('segments', len(segments), 'duration', tl['duration'])
