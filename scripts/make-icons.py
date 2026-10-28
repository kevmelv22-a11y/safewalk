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
full = src.crop(S(22, 62, 665, 950))
full.resize((900, int(900 * full.height / full.width)), Image.LANCZOS).save('assets/logo-full.png', optimize=True)
full.resize((600, int(600 * full.height / full.width)), Image.LANCZOS).save('assets/splash-icon.png', optimize=True)
