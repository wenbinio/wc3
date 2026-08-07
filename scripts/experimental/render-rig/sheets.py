#!/usr/bin/env python3
"""Compose labeled contact sheets from the rig's per-model PNGs.

One sheet per stage group (out/models/<group>__<name>.png -> out/sheet-<group>.png).
Usage: python3 scripts/experimental/render-rig/sheets.py
Env: RENDER_RIG_DIR overrides the default <repo>/_build/render-rig work dir.
"""
from PIL import Image, ImageDraw, ImageFont
import glob, os, math

RIG_SRC = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(RIG_SRC, '..', '..', '..'))
WORK = os.environ.get('RENDER_RIG_DIR', os.path.join(REPO, '_build', 'render-rig'))
MODELS = os.path.join(WORK, 'out', 'models')

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
if not os.path.exists(FONT):
    FONT = sorted(glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True) +
                  glob.glob('/usr/share/fonts/**/DejaVuSans.ttf', recursive=True))[0]

BG = (26, 28, 33)
LABEL_BG = (16, 17, 20)
FG = (225, 225, 220)
SUB = (150, 190, 235)


def sheet(entries, out, tile=340, label_h=46, cols=None, title=None):
    n = len(entries)
    cols = cols or min(6, max(3, math.ceil(math.sqrt(n))))
    rows = math.ceil(n / cols)
    title_h = 64 if title else 0
    W = cols * tile
    H = title_h + rows * (tile + label_h)
    img = Image.new('RGB', (W, H), BG)
    dr = ImageDraw.Draw(img)
    f_label = ImageFont.truetype(FONT, 22)
    f_sub = ImageFont.truetype(FONT, 17)
    f_title = ImageFont.truetype(FONT, 34)
    if title:
        dr.text((16, 14), title, fill=FG, font=f_title)
    for i, (png, label, sub) in enumerate(entries):
        r, c = divmod(i, cols)
        x, y = c * tile, title_h + r * (tile + label_h)
        try:
            im = Image.open(png).convert('RGB').resize((tile, tile), Image.LANCZOS)
            img.paste(im, (x, y))
        except Exception:
            dr.rectangle([x, y, x + tile, y + tile], fill=(60, 20, 20))
            dr.text((x + 12, y + tile // 2), 'RENDER FAILED', fill=(255, 120, 120), font=f_label)
        dr.rectangle([x, y + tile, x + tile, y + tile + label_h], fill=LABEL_BG)
        # trim label to fit
        lab = label
        while dr.textlength(lab, font=f_label) > tile - 14 and len(lab) > 4:
            lab = lab[:-1]
        dr.text((x + 7, y + tile + 3), lab, fill=FG, font=f_label)
        if sub:
            dr.text((x + 7, y + tile + 26), sub, fill=SUB, font=f_sub)
        dr.rectangle([x, y, x + tile - 1, y + tile + label_h - 1], outline=(50, 53, 60))
    img.save(out, optimize=True)
    print(out, f'{W}x{H}', f'{os.path.getsize(out)/1e6:.2f}MB', f'{n} tiles')


groups = {}
for f in sorted(os.listdir(MODELS)):
    if not f.endswith('.png') or '__' not in f:
        continue
    group, name = f[:-4].split('__', 1)
    groups.setdefault(group, []).append((os.path.join(MODELS, f), name, group))

if not groups:
    raise SystemExit(f'no rendered models under {MODELS} — run shoot.mjs first')
for group, entries in groups.items():
    entries.sort(key=lambda t: t[1].lower())
    sheet(entries, os.path.join(WORK, 'out', f'sheet-{group}.png'), cols=4,
          title=f'{group} (team color shown as white; stock textures = solid fills)')
