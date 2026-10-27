"""Validate every playable image and the recorded generation provenance."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources', action='store_true', help='Also require the local ImageGen originals')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
scenes = json.loads(subprocess.check_output(
    ['node', '-e', "console.log(JSON.stringify(require('./game-data.js').scenes))"], cwd=ROOT))
manifest = json.loads((ROOT / 'assets/level-art-manifest.json').read_text())
entries = {entry['level']: entry for entry in manifest}
assert len(entries) == len(manifest), 'Duplicate manifest levels'
assert set(entries) == set(range(101, len(scenes) + 1)), 'Incomplete art manifest'
hashes = set()
for scene in scenes:
    level = scene['index'] + 1
    path = ROOT / scene['url']
    with Image.open(path) as picture:
        picture.load()
        assert picture.format == 'JPEG', (level, picture.format)
        assert picture.width == picture.height, (level, picture.size)
        if level >= 101:
            assert picture.size == (1024, 1024), (level, picture.size)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest not in hashes, ('Duplicate artwork', level)
    hashes.add(digest)
    if level in entries:
        entry = entries[level]
        assert entry['title'] == scene['title'], level
        assert entry['file'] == path.name, level
        assert entry['tool'] == 'built-in image_gen', level
jobs = json.loads((ROOT / 'tools/art-upgrade-jobs.json').read_text())
assert len({job['level'] for job in jobs}) == len(jobs), 'Duplicate art jobs'
for job in jobs:
    assert job['status'] == 'complete', job['level']
    if args.sources:
        assert Path(job['source']).exists(), ('Missing source', job['level'])
    assert entries[job['level']]['prompt'] == job['prompt'], job['level']
print(json.dumps(dict(decoded_jpegs=len(scenes), unique_sha256=len(hashes),
                      high_resolution_images=len(entries), completed_jobs=len(jobs))))
