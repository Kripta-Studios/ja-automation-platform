"""Original 120 BPM soundtrack for the J&A trailer (procedurally synthesized, license-free)."""
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
TOTAL_BARS = 66
LENGTH = TOTAL_BARS * BAR + 4.0
N = int(LENGTH * SR)
rng = np.random.default_rng(7)

BUS = {'m': [np.zeros(N), np.zeros(N)], 'd': [np.zeros(N), np.zeros(N)]}


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def add(sig, t0, gain=1.0, pan=0.0, bus='m'):
    i = int(t0 * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L, R = BUS[bus]
    L[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))


def saw(f, t):
    return 2 * ((f * t) % 1.0) - 1


def env_adsr(n, a, d, s, r, sustain_len):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where((t >= a + d) & (t < sustain_len), s, e)
    e = np.where(t >= sustain_len, s * np.exp(-(t - sustain_len) / max(r, 1e-4)), e)
    return e


# vi - IV - I - V in C major (Am F C G), plus a lifted variant for the B section
PROG_A = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
PROG_B = [[53, 57, 60, 64], [55, 59, 62, 67], [57, 60, 64, 69], [52, 56, 59, 64]]
ROOTS_A = [45, 41, 36, 43]
ROOTS_B = [41, 43, 45, 40]


def section(bar):
    if bar < 4:
        return 'intro'
    if bar < 20:
        return 'A'
    if bar < 36:
        return 'B'
    if bar < 52:
        return 'A2'
    if bar < 56:
        return 'break'
    if bar < 62:
        return 'drop'
    return 'outro'


def chord_for(bar):
    sec = section(bar)
    prog, roots = (PROG_B, ROOTS_B) if sec in ('B', 'drop') else (PROG_A, ROOTS_A)
    return prog[bar % 4], roots[bar % 4]


def pad(notes, dur, bright=1800):
    n = int((dur + 1.5) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for note in notes:
        f = midi(note)
        for det in (-0.12, 0.0, 0.12):
            sig += saw(f * 2 ** (det / 12), t + rng.random())
    sig = lp(sig / (len(notes) * 3), bright, 2)
    return sig * env_adsr(n, 0.35, 0.4, 0.8, 0.9, dur)


def pluck(note, dur=0.22):
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    f = midi(note)
    sig = 0.6 * saw(f, t) + 0.4 * np.sign(np.sin(2 * np.pi * f * t))
    sig = lp(sig, 3200) * np.exp(-t / 0.12)
    return sig


def bass(note, dur):
    n = int((dur + 0.05) * SR)
    t = np.arange(n) / SR
    f = midi(note)
    sig = np.sin(2 * np.pi * f * t) + 0.35 * lp(saw(f, t), 600)
    e = np.minimum(1, t / 0.005) * np.exp(-t / 0.35)
    e[-int(0.04 * SR):] *= np.linspace(1, 0, int(0.04 * SR))
    return sig * e


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(1.6 * np.sin(ph) * np.exp(-t / 0.16))


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 4200)
    e = np.exp(-t / 0.07)
    for off in (0.0, 0.011, 0.022):
        e += 0.6 * np.exp(-np.maximum(t - off, 0) / 0.008) * (t >= off)
    return noise * e * 0.5


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t / (0.08 if open_ else 0.018))


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(0.05 * SR)
    for s in range(0, n, seg):
        fc = 400 + 9000 * (s / n) ** 2
        out[s:s + seg] = bp(noise[max(0, s - 2000):s + seg], fc * 0.7, min(fc * 1.3, 20000))[-len(out[s:s + seg]):]
    return out * (t / dur) ** 2


def impact():
    n = int(3.5 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (40 + 60 * np.exp(-t / 0.08)) * t) * np.exp(-t / 0.9)
    wash = lp(rng.standard_normal(n), 2500) * np.exp(-t / 0.6) * 0.4
    return np.tanh(1.5 * (boom + wash))


sidechain = np.ones(N)


def duck(t0):
    i = int(t0 * SR)
    n = int(0.3 * SR)
    curve = 1 - 0.65 * np.exp(-np.arange(n) / SR / 0.09)
    j = min(N, i + n)
    sidechain[i:j] = np.minimum(sidechain[i:j], curve[: j - i])



for bar in range(TOTAL_BARS):
    sec = section(bar)
    t0 = bar * BAR
    notes, root = chord_for(bar)
    # pads everywhere (brighter in the drop)
    bright = {'intro': 900, 'break': 1200, 'drop': 3200, 'outro': 1400}.get(sec, 2200)
    if sec == 'outro' and bar > 62:
        continue
    p = pad(notes, BAR if sec != 'outro' else 6.0, bright)
    add(p, t0, 0.22 if sec not in ('break', 'intro') else 0.3, -0.25)
    add(p, t0 + 0.012, 0.22 if sec not in ('break', 'intro') else 0.3, 0.25)

    full = sec in ('A', 'B', 'A2', 'drop')
    if full:
        for b in range(4):
            add(kick(), t0 + b * BEAT, 0.85, bus='d')
            duck(t0 + b * BEAT)
            add(hat(open_=True), t0 + b * BEAT + BEAT / 2, 0.12, 0.3, bus='d')
            for s16 in (1, 3):
                add(hat(), t0 + b * BEAT + s16 * BEAT / 4, 0.07, -0.3, bus='d')
        add(clap(), t0 + BEAT, 0.45, 0.05, bus='d')
        add(clap(), t0 + 3 * BEAT, 0.45, -0.05, bus='d')
        for e8 in range(8):
            if e8 % 2 == 1 or sec in ('B', 'drop'):
                add(bass(root, BEAT / 2 * 0.9), t0 + e8 * BEAT / 2, 0.42)
    if sec in ('A', 'B', 'A2', 'drop', 'intro', 'break'):
        arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[2] + 12, notes[1] + 12, notes[3] + 12, notes[2] + 24]
        gain = {'intro': 0.07, 'break': 0.09}.get(sec, 0.12)
        for s16 in range(16):
            pl = pluck(arp[s16 % 8])
            if sec == 'intro':
                pl = lp(pl, 400 + 2600 * (bar * 16 + s16) / 64)
            add(pl, t0 + s16 * BEAT / 4, gain, 0.35 if s16 % 2 else -0.35)
            add(pl, t0 + s16 * BEAT / 4 + 3 * BEAT / 4, gain * 0.35, -0.5 if s16 % 2 else 0.5)

# risers into the main sections, a snare-style build in the break and impacts on the big moments
add(riser(BAR * 2), 2 * BAR, 0.35)
add(riser(BAR * 4), 52 * BAR, 0.4)
for i in range(32):
    tt = 54 * BAR + i * (2 * BAR / 32)
    add(clap(), tt, 0.12 + 0.35 * i / 32, bus='d')
for bar_hit in (4, 20, 36, 56, 62):
    add(impact(), bar_hit * BAR, 0.55, bus='d')

mix_L = BUS['m'][0] * sidechain + BUS['d'][0]
mix_R = BUS['m'][1] * sidechain + BUS['d'][1]
fade_in = np.minimum(1, np.arange(N) / (0.8 * SR))
fade_out = np.clip((LENGTH - np.arange(N) / SR) / 3.0, 0, 1)
mix = np.stack([mix_L, mix_R], 1) * (fade_in * fade_out)[:, None]
mix = np.tanh(mix * 1.15)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write('audio/soundtrack.wav', SR, (mix * 32767).astype(np.int16))
print('wrote', LENGTH, 'seconds')
