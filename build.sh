#!/usr/bin/env bash
# Reconstruye originalindex.html combinando index.html + app.css + app.js
# Ejecutar: ./build.sh

set -e

python3 - <<'PYTHON'
import sys, os

base = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else '.'

for name in ('index.html', 'app.css', 'app.js'):
    path = os.path.join(base, name)
    if not os.path.exists(path):
        print(f'ERROR: no se encontró {name}')
        sys.exit(1)

with open(os.path.join(base, 'index.html'), 'r', encoding='utf-8') as f:
    html = f.read()

with open(os.path.join(base, 'app.css'), 'r', encoding='utf-8') as f:
    css = f.read()

with open(os.path.join(base, 'app.js'), 'r', encoding='utf-8') as f:
    js = f.read()

# Inline CSS
html = html.replace(
    '<link rel="stylesheet" href="app.css">',
    '<style>\n' + css + '\n    </style>'
)

# Inline JS
html = html.replace(
    '<script src="app.js"></script>',
    '<script>\n' + js + '\n</script>'
)

if '<link rel="stylesheet" href="app.css">' in html:
    print('ADVERTENCIA: app.css no fue reemplazado (verifica index.html)')
if '<script src="app.js"></script>' in html:
    print('ADVERTENCIA: app.js no fue reemplazado (verifica index.html)')

out = os.path.join(base, 'originalindex.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'✓ originalindex.html reconstruido ({len(html.splitlines())} líneas)')
PYTHON
