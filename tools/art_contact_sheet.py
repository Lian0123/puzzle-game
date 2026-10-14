"""Create labeled QA thumbnails without modifying shipped artwork."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root = Path(__file__).resolve().parents[1]
entries = json.loads((root / 'assets/level-art-manifest.json').read_text())
font = ImageFont.load_default()
for start in (map(int, sys.argv[1:]) if len(sys.argv) > 1 else range(141, 301, 20)):
    sheet = Image.new('RGB', (1100, 1000), '#141a35')
    draw = ImageDraw.Draw(sheet)
    for offset, level in enumerate(range(start, start + 20)):
        path = root / 'assets' / entries[level - 101]['file']
        if not path.exists():
            raise FileNotFoundError(path)
        with Image.open(path) as original:
            original.verify()
        with Image.open(path) as original:
            assert original.size == (1024, 1024), (level, original.size)
            image = original.convert('RGB').resize((208, 208), Image.Resampling.LANCZOS)
        x, y = offset % 5 * 220 + 6, offset // 5 * 250 + 6
        sheet.paste(image, (x, y))
        draw.text((x + 5, y + 216), f'STAGE {level}', font=font, fill='#ffe3a4')
    output = root / 'qa' / f'new-art-{start}-{start + 19}.jpg'
    sheet.save(output, quality=92)
    print(output)
