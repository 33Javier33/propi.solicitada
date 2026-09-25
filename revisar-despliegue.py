#!/usr/bin/env python3
"""Revisa vercel.json antes de publicar.

Existe porque una clave inventada dentro de vercel.json ("_comentario", puesta
para documentar una regla) hace que Vercel RECHACE el despliegue entero, sin
que nada falle en el repositorio: los commits se suben bien y la app se queda
congelada en la versión anterior. Costó tres despliegues en falso descubrirlo.

Comprueba dos cosas:
  1. que vercel.json solo use claves que Vercel acepta;
  2. que todo archivo local que carga el HTML tenga no-caché o un ?v=,
     porque si no el navegador se queda con la copia vieja.

Uso:  python3 revisar-despliegue.py
"""
import json, re, sys, glob, os

RAIZ_OK = {'headers','redirects','rewrites','cleanUrls','trailingSlash','buildCommand',
           'outputDirectory','framework','installCommand','devCommand','regions',
           'functions','crons','images','public','git','ignoreCommand'}
REGLA_OK = {'source','headers','has','missing'}
CAB_OK   = {'key','value'}

fallos = []
base = os.path.dirname(os.path.abspath(__file__))
vj = os.path.join(base, 'vercel.json')

fuentes = []
if os.path.exists(vj):
    d = json.load(open(vj, encoding='utf-8'))
    for k in set(d) - RAIZ_OK:
        fallos.append(f'vercel.json: clave desconocida en la raíz: "{k}"')
    for r in d.get('headers', []):
        for k in set(r) - REGLA_OK:
            fallos.append(f'vercel.json: clave desconocida en la regla "{r.get("source")}": "{k}"')
        for h in r.get('headers', []):
            for k in set(h) - CAB_OK:
                fallos.append(f'vercel.json: clave desconocida en una cabecera: "{k}"')
        fuentes.append(r.get('source',''))

def cubierto(ruta):
    for f in fuentes:
        if re.match('^' + re.escape(f).replace(r'\(\.\*\)', '.*') + '$', '/' + ruta.lstrip('/')):
            return True
    return False

for pag in glob.glob(os.path.join(base, 'index*.html')):
    if 'original' in pag or '_original' in pag: continue
    html = open(pag, encoding='utf-8').read()
    for r in re.findall(r'<(?:script[^>]+src|link[^>]+href)="([^"]+)"', html):
        if r.startswith('http'): continue
        ruta, _, qs = r.partition('?')
        if not cubierto(ruta) and 'v=' not in qs:
            fallos.append(f'{os.path.basename(pag)}: "{r}" no tiene no-caché ni ?v= — el navegador puede quedarse con la copia vieja')

if fallos:
    print('✗ NO PUBLICAR todavía:')
    for f in fallos: print('   ·', f)
    sys.exit(1)
print('✓ vercel.json válido y todos los recursos protegidos de la caché')
