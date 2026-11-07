from pathlib import Path
import zipfile
import json
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'extension/manifest.json').read_text())
version=manifest['version']
(root/'dist').mkdir(exist_ok=True)
with zipfile.ZipFile(root/f'dist/tianji-{version}.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted((root/'extension').rglob('*')):
        if p.is_file():
            rel=str(p.relative_to(root/'extension'))
            z.write(p,rel)
with zipfile.ZipFile(root/f'dist/tianji-source-{version}.zip','w',zipfile.ZIP_DEFLATED) as z:
    for folder in ['extension','src','scripts','tests','docs']:
        for p in sorted((root/folder).rglob('*')):
            if p.is_file():z.write(p,'tianji/'+str(p.relative_to(root)))
    for name in ['package.json','package-lock.json','README.md','PRIVACY.md','VALIDATION.md','.gitignore']:
        z.write(root/name,'tianji/'+name)
print('Packaged extension and source ZIPs; no private data or dependencies included.')
