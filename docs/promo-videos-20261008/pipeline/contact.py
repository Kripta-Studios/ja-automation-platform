import json, sys
from PIL import Image
for name in sys.argv[1:]:
    d = json.load(open(f'rec/{name}/index.json')); f = d['frames']; T = f[-1]['t']
    ts = [T * k / 7 for k in range(8)]
    pick = [min(f, key=lambda x: abs(x['t'] - t)) for t in ts]
    ims = [Image.open(f'rec/{name}/frames/' + p['file']) for p in pick]
    w, h = ims[0].size; tw = 480; th = int(h * tw / w)
    o = Image.new('RGB', (tw * 4, th * 2), 'black')
    for i, im in enumerate(ims): o.paste(im.resize((tw, th)), ((i % 4) * tw, (i // 4) * th))
    o.save(f'shots/contact-{name}.jpg', quality=85); print(name, len(f), 'frames', round(T, 1), 's', [round(t, 1) for t in ts])
