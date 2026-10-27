"""Install an ImageGen result; use --replace to replace an already completed job."""
import fcntl
import json
import sys
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1]
def write_json(path, value):
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(path)

level=int(sys.argv[1])
source=Path(sys.argv[2])
with (root/'tools/.art-record.lock').open('w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    jobpath=root/'tools/art-upgrade-jobs.json'
    jobs=json.loads(jobpath.read_text())
    job=next(item for item in jobs if item['level']==level)
    if job.get('status')=='complete' and '--replace' not in sys.argv[3:]:
        raise SystemExit(0)
    with Image.open(source) as image:
        if image.width!=image.height: raise ValueError('Artwork must be square')
        image.convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS).save(root/'assets'/job['file'],'JPEG',quality=90,optimize=True,progressive=True)
    manifestpath=root/'assets/level-art-manifest.json'
    manifest=json.loads(manifestpath.read_text())
    entry={k:job[k] for k in ('level','title','subtitle','file','prompt')}
    entry.update(tool='built-in image_gen',source=str(source),revision=('2026-10-27-cubist-expansion' if level>=701 else '2026-10-24-detailed-art'))
    manifest=[item for item in manifest if item['level']!=level]+[entry]
    manifest.sort(key=lambda item:item['level'])
    write_json(manifestpath,manifest)
    job.update(status='complete',source=str(source))
    write_json(jobpath,jobs)
