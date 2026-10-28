# Genereert app-iconen, splash en logo uit het officiële logo (safewalk-assets/logo-source.jpg)
import sys
from PIL import Image, ImageDraw, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else '../safewalk-assets/logo-source.jpg'
src = Image.open(SRC).convert('RGB'); k = src.width / 687  # coördinaten gemeten op 687 px breed
S = lambda *b: tuple(int(v * k) for v in b)
BG = (4, 11, 26)  # #040B1A, achtergrond van het logo

def shield(size, frac):
    crop = src.crop(S(68, 118, 618, 668)).resize((int(size * frac),) * 2, Image.LANCZOS)
    s = crop.size[0]; m = Image.new('L', crop.size, 0)
    ImageDraw.Draw(m).ellipse([s * .02, s * .02, s * .98, s * .98], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(s * .04))
    out = Image.new('RGB', (size, size), BG); o = (size - s) // 2
    out.paste(crop, (o, o), m); return out

shield(1024, .92).save('assets/icon.png')            # iOS: ondoorzichtig
shield(1024, .62).save('assets/adaptive-icon.png')    # Android: binnen veilige zone (~66%)
shield(48, .95).save('assets/favicon.png')
# Transparante master (zie make-transparent.py) voor logo in de app, splash en Android-foreground
import os
TR = os.path.join(os.path.dirname(SRC), 'logo-transparent.png')
full = Image.open(TR).convert('RGBA')
sh = full.crop((0, 0, full.width, int(full.height * 0.80))); sh = sh.crop(sh.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox())
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); t = sh.copy(); t.thumbnail((620, 620), Image.LANCZOS)
fg.paste(t, ((1024 - t.width) // 2, (1024 - t.height) // 2), t); fg.save('assets/adaptive-icon.png')  # Android: transparant
full.resize((900, int(900 * full.height / full.width)), Image.LANCZOS).save('assets/logo-full.png', optimize=True)
full.resize((600, int(600 * full.height / full.width)), Image.LANCZOS).save('assets/splash-icon.png', optimize=True)
