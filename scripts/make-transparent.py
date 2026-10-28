# Maakt een transparante logo-master: donkere achtergrond (zwart + #040B1A-kaart) wordt alfa,
# gloed blijft als zachte halftransparante rand ("unscreen" met kleur-terugrekening).
import sys
import numpy as np
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else '../safewalk-assets/logo-source.jpg'
OUT = sys.argv[2] if len(sys.argv) > 2 else '../safewalk-assets/logo-transparent.png'
src = Image.open(SRC).convert('RGB'); k = src.width / 687
crop = src.crop(tuple(int(v * k) for v in (58, 98, 630, 880)))  # binnen het kaartkader: schild + tekst
c = np.asarray(crop).astype(np.float32)
b = np.array([4, 11, 26], np.float32)
a = np.clip(((c - b) / (255 - b)).max(axis=2), 0, 1)
a = np.clip((a - 0.04) / 0.96, 0, 1) ** 0.8          # ruis weg, iets voller
# Schild-binnenkant ondoorzichtig houden: heldere gouden rand -> alles wat daardoor ingesloten is = vast
from PIL import ImageDraw, ImageFilter
edge = Image.fromarray(((a > 0.55) * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(5))
fill = Image.new('L', (edge.width + 4, edge.height + 4), 0); fill.paste(edge, (2, 2))
ImageDraw.floodfill(fill, (0, 0), 128)
solid = (np.asarray(fill)[2:-2, 2:-2] != 128).astype(np.uint8) * 255
solid = np.asarray(Image.fromarray(solid, 'L').filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2))) / 255.0
a = np.maximum(a, solid)
safe = np.maximum(a, 1e-3)[..., None]
rgb = np.clip(b + (c - b) / safe, 0, 255)
out = np.dstack([rgb, a[..., None] * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA'); img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
img.save(OUT, optimize=True); print(OUT, img.size)
