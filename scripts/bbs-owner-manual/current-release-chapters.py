"""Reuse the current Owner procedures without changing preserved training artifacts."""
def apply_current_release():
    source = json.loads((ROOT.parent/'bbs-role-manuals/content/owner.json').read_text())
    additions = []
    for chapter in source['chapters']:
        if not chapter['id'].startswith('release-'):
            continue
        blocks = [('Context', text) for text in chapter.get('paragraphs', [])]
        blocks += [('Do the task', text) for text in chapter.get('steps', [])]
        blocks += [('Verify / recover', text) for key in ['checks', 'recovery'] for text in chapter.get(key, [])]
        chunks, chunk, words = [], [], 0
        for kind, text in blocks:
            count = len(text.split())
            if chunk and words + count > 230:
                chunks.append(chunk); chunk, words = [], 0
            chunk.append((kind, text)); words += count
        if chunk: chunks.append(chunk)
        for i, chunk in enumerate(chunks):
            key = chapter['id'] + ('-'+str(i+1) if i else '')
            title = chapter['title'] + (' · continued' if i else '')
            body = route(html.escape(chapter['route'])) + ''.join('<p><strong>'+kind+':</strong> '+html.escape(text)+'</p>' for kind,text in chunk)
            additions.append(dict(key=key,title=title,body=body,toc=i==0,wide=False,figure=False,context='Current workflow reference · 17 October 2026 · earlier figures retain their original dates'))
    # Current instructions precede the dated BBS practice; final invoice masters remain last.
    position = next(i for i,p in enumerate(pages) if not (p['key']=='cover' or p['key'].startswith('contents-')))
    pages[position:position] = additions
    for p in pages:
        if p['key'].startswith('release-'): continue
        p['body']=p['body'].replace('then Finance review.', 'inspect financial acceptance (Owner approval now includes it; PM approval still needs Finance review).')
        p['body']=p['body'].replace('operational approval, then Finance review/billability.', 'operational approval and financial acceptance (combined for Owner approval); verify remaining billability and classification.')
        if p['key']=='cover':
            p['body']='<p><strong>Updated 17 October 2026.</strong> Start with the current navigation, project, follow-up and invoice chapters. Later screenshots preserve dated training examples; use the current instructions when screen layout differs.</p>'+p['body']
