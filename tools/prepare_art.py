"""Format a generated landscape for the game; preserve the source image."""
from pathlib import Path
import sys
from PIL import Image

if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:3])
    with Image.open(source) as image:
        if image.width != image.height:
            raise ValueError('Puzzle art must be square; regenerate this asset.')
        image.convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS).save(destination, 'JPEG', quality=84, optimize=True, progressive=True)
