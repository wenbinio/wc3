#!/usr/bin/env python3
"""Render the actual extracted MDX/BLP bytes with an independent WebGL viewer.
This is asset preview evidence, never a Warcraft client playtest.
No network assets, guessed textures, image-generation or emulated game data.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

NAMES = ('Wall', 'Carpet', 'Fixture', 'Fuse', 'Generator', 'Exit', 'Custodian')
JS = r'''async ({files, name}) => {
  const canvas = document.querySelector('canvas');
  const viewer = new ModelViewer.viewer.ModelViewer(canvas, {alpha:false, preserveDrawingBuffer:true});
  const errors = [];
  viewer.on('error', e => errors.push(String(e.error) + ': ' + String(e.reason || '')));
  for (const kind of ['mdx', 'blp']) {
    if (!viewer.addHandler(ModelViewer.viewer.handlers[kind])) throw Error('handler failed: ' + kind);
  }
  const scene = viewer.addScene();
  scene.viewport = [0,0,640,480];
  scene.color.set([.12,.14,.17]);
  scene.camera.perspective(Math.PI/4, 640/480, 1, 5000);
  const solve = p => {
    if (typeof p !== 'string') return p;
    const k = p.replace(/\\/g,'/').toLowerCase();
    if (!files[k]) throw Error('unresolved imported texture/model: ' + p);
    return Uint8Array.from(atob(files[k]), c => c.charCodeAt(0));
  };
  const model = await viewer.load('war3mapImported/' + name + '.mdx', solve);
  if (!model) throw Error('MDX load failed: ' + errors.join('; '));
  await viewer.whenAllLoaded();
  if (errors.length) throw Error(errors.join('; '));
  if (!model.textures.length || model.textures.some(t => !t.texture)) throw Error('texture not actually loaded');
  const z = name === 'Fixture' ? 165 : name === 'Carpet' ? 0 : name === 'Custodian' ? 85 : 80;
  const distance = name === 'Wall' || name === 'Carpet' ? 640 : name === 'Custodian' ? 440 : 450;
  scene.camera.moveToAndFace([distance*.9,-distance*.95,z+distance*.6], [0,0,z], [0,0,1]);
  const instance = model.addInstance();
  instance.setScene(scene);
  const requests = [{sequence:'Stand', t:.25, label:'stand'}];
  if (name === 'Custodian') {
    for (const sequence of ['Walk','Walk Fast']) {
      for (let i=0;i<12;i++) requests.push({sequence,t:i/12,label:sequence.replace(/ /g,'-').toLowerCase()+'-'+String(i).padStart(2,'0')});
    }
  }
  const frames = [];
  for (const request of requests) {
    const seq = model.sequences.findIndex(s=>s.name===request.sequence);
    if (seq < 0) throw Error('missing sequence: '+request.sequence);
    instance.setSequence(seq);
    instance.frame=model.sequences[seq].interval[0]+request.t*(model.sequences[seq].interval[1]-model.sequences[seq].interval[0]);
    instance.forced=true;
    viewer.gl.clearColor(.12,.14,.17,1);
    viewer.updateAndRender(0);
    viewer.gl.finish();
    const error=viewer.gl.getError();
    if(error!==viewer.gl.NO_ERROR) throw Error('WebGL error '+error);
    frames.push({...request,png:canvas.toDataURL('image/png').split(',')[1],visible:viewer.visibleInstances});
  }
  if(errors.length)throw Error(errors.join('; '));
  return {name,frames,textures:model.textures.length,geosets:model.geosets.length};
}'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('extracted_directory', type=Path)
    parser.add_argument('output_directory', type=Path)
    parser.add_argument('--browser', help='Optional explicit installed Chromium path')
    args = parser.parse_args()
    root = args.extracted_directory.resolve()
    out = args.output_directory.resolve()
    if out.exists():
        raise ValueError('Use a fresh render output directory')
    out.mkdir(parents=True)
    repo = Path(__file__).resolve().parents[2]
    bundle = repo / 'node_modules/mdx-m3-viewer-th/dist/umd/viewer.min.js'
    files = {}
    for f in (root / 'war3mapImported').iterdir():
        if f.suffix.lower() in ('.mdx', '.blp'):
            if f.is_symlink() or f.stat().st_size > 16 * 1024**2:
                raise ValueError('Unbounded or symlink asset')
            files[f.relative_to(root).as_posix().lower()] = base64.b64encode(f.read_bytes()).decode('ascii')
    report = {'schemaVersion': 1, 'status': 'RUNNING', 'scope': 'independent WebGL asset previews from extracted archive bytes',
              'retailClientValidated': False, 'renderer': 'mdx-m3-viewer-th', 'models': [],
              'assetSha256': {k: hashlib.sha256(base64.b64decode(v)).hexdigest() for k,v in files.items()}}
    try:
        with sync_playwright() as p:
            kwargs = {'headless': True, 'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']}
            if args.browser:
                kwargs['executable_path'] = args.browser
            browser = p.chromium.launch(**kwargs)
            report['browser'] = browser.version
            for name in NAMES:
                page = browser.new_page(viewport={'width':640,'height':480})
                page.route('**/*', lambda route: route.abort())
                page.set_content('<html><body style="margin:0"><canvas width="640" height="480"></canvas></body></html>')
                page.add_script_tag(path=str(bundle))
                result = page.evaluate(JS, {'files': files, 'name': name})
                rendered = {}
                summaries = []
                for frame in result['frames']:
                    raw = base64.b64decode(frame.pop('png'))
                    image = Image.open(io.BytesIO(raw)).convert('RGB')
                    filename = f'{name}-{frame["label"]}.png'
                    (out / filename).write_bytes(raw)
                    background = image.getpixel((0,0))
                    pixels = sum(1 for px in image.getdata() if max(abs(px[i]-background[i]) for i in range(3)) > 8)
                    if pixels < 100 or frame['visible'] < 1:
                        raise AssertionError(f'{name}/{frame["label"]}: blank or culled render ({pixels} pixels)')
                    # This caught the prior blue-wall / red-blue tint-order mistake.
                    if name == 'Wall':
                        yellow = sum(1 for px in image.getdata() if abs(px[0]-163)<4 and abs(px[1]-148)<4 and abs(px[2]-87)<4)
                        if yellow < 100:
                            raise AssertionError('Wall material is not the authored yellow in the actual render')
                    rendered[frame['label']] = image
                    summaries.append({**frame, 'file':filename, 'nonBackgroundPixels':pixels, 'sha256':hashlib.sha256(raw).hexdigest()})
                if name == 'Custodian':
                    for seq in ('walk','walk-fast'):
                        a,b = rendered[seq+'-03'],rendered[seq+'-09']
                        diff = ImageChops.difference(a,b)
                        changed = sum(1 for px in diff.getdata() if max(px)>8)
                        if changed < 50:
                            raise AssertionError(f'{seq}: frozen rendered limbs ({changed} changed pixels)')
                        frames = [rendered[f'{seq}-{i:02d}'] for i in range(12)]
                        frames[0].save(out / f'Custodian-{seq}.gif', save_all=True, append_images=frames[1:], duration=67 if seq=='walk' else 45, loop=0)
                report['models'].append({'name':name,'loadedTextures':result['textures'],'geosets':result['geosets'],'frames':summaries})
                page.close()
            browser.close()
        report['status'] = 'PASS'
    except Exception as exc:
        report['status'] = 'FAIL'
        report['error'] = str(exc)
        raise
    finally:
        (out/'render-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'models':len(report['models']),'retailClientValidated':False}))

if __name__ == '__main__':
    main()
