#!/usr/bin/env python3
"""Bundle the modular source into a single self-contained page.

The game is written as ES modules, which browsers refuse to load over file://
(an opaque origin fails the CORS check). This concatenates them, inlines the
stylesheet, and writes one HTML file you can double-click.

    python build.py

Two copies are written:

    index.html          for double-clicking, and for a Pages root deploy
    deploy/index.html   the folder the Pages workflow publishes

Both are byte-identical. Because everything is inlined there are no relative
asset paths, so the same file works at a domain root, in a /repo/ subpath, or
straight off the filesystem.

dev.html + serve.py remain the module-based workflow for editing the source.

shared/ holds the arcade design system and Firebase layer, copied in from the
arcade root by ../tools/sync-shared.py. Edit /shared, sync, then rebuild.
"""

import io
import os
import re
import sys
from collections import defaultdict

# Dependency order. There are no cycles, so plain concatenation is enough.
MODULES = [
    'settings', 'profile', 'rng', 'data', 'editions', 'stakes', 'wheels',
    'tokens', 'omens', 'bosses', 'charters', 'tags', 'packs',
    'audio', 'fx', 'wheelview', 'engine', 'ui', 'main'
]

DEPLOY_DIR = 'deploy'

# GitHub Pages reads the custom domain from a CNAME file at the published root.
# build.py owns everything in deploy/, so it writes this too rather than leaving
# a hand-placed file to be forgotten after a clean checkout.
CUSTOM_DOMAIN = 'nolimit.marsindustries.dev'

CSS_LINK = '<link rel="stylesheet" href="styles.css" />'
MODULE_TAG = '<script type="module" src="src/main.js"></script>'

# The shared arcade layer (design system + account + leaderboards) lives in
# shared/, kept in step with the other games by ../tools/sync-shared.py. It is
# inlined here for the same reason as everything else: index.html must work
# straight off the filesystem with no relative assets.
ARCADE_CSS_LINK = '<link rel="stylesheet" href="shared/css/arcade.css" />'
ARCADE_SCRIPTS = [
    'shared/js/arcade-config.js',
    'shared/js/arcade-auth.js',
    'shared/js/arcade-scores.js',
    'shared/js/arcade-ui.js',
    'shared/js/arcade-broker.js',
    'shared/js/arcade.js',
]

IMPORT_RE = re.compile(r'^import\b[\s\S]*?;[ \t]*$', re.M)
EXPORT_RE = re.compile(r'^export[ \t]+', re.M)
DECL_RE = re.compile(r'^(?:const|let|var|function|class)[ \t]+([A-Za-z_$][\w$]*)', re.M)

NOT_FOUND = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nothing here &mdash; No Limit</title>
<style>
  html, body { height: 100%; margin: 0; font-family: 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif; }
  body {
    background: radial-gradient(circle at 50% 0%, #14503a 0%, #0d3b2a 38%, #072016 100%);
    color: #eae5d8; display: grid; place-items: center; text-align: center; padding: 24px;
  }
  h1 { font-size: 34px; letter-spacing: .2em; color: #d9b45b; text-transform: uppercase; margin: 0 0 10px; }
  p { color: #99a1ad; }
  a {
    display: inline-block; margin-top: 18px; padding: 11px 22px; border-radius: 8px;
    background: linear-gradient(180deg, #d94f3d, #9c2c1f); border: 1px solid #e8705f;
    color: #fff; text-decoration: none; font-weight: bold; letter-spacing: .09em; text-transform: uppercase;
  }
</style>
</head>
<body>
<div>
  <h1>Nothing here</h1>
  <p>The house has no record of that page.</p>
  <a id="back" href="/">Back to the table</a>
</div>
<script>
  // Project sites live at /<repo>/, user and org sites at /. Guess the game's
  // root from the first path segment, and fall back to the domain root.
  var seg = location.pathname.split('/').filter(Boolean);
  var projectSite = location.hostname.indexOf('github.io') !== -1 && seg.length > 1;
  document.getElementById('back').href = projectSite ? '/' + seg[0] + '/' : '/';
</script>
</body>
</html>
"""


def read(path):
    return io.open(path, encoding='utf-8').read()


def write(path, text):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='\n').write(text)


def build_bundle():
    bodies = {}
    for name in MODULES:
        src = read(f'src/{name}.js')
        src = IMPORT_RE.sub('', src)
        src = EXPORT_RE.sub('', src)
        bodies[name] = src.strip()

    # Concatenating into one scope means two modules must never declare the
    # same top-level name. Fail loudly rather than shipping a shadowing bug.
    owners = defaultdict(list)
    for name in MODULES:
        for decl in DECL_RE.findall(bodies[name]):
            owners[decl].append(name)
    clashes = {k: v for k, v in owners.items() if len(v) > 1}
    if clashes:
        for decl, mods in sorted(clashes.items()):
            print(f'error: "{decl}" is declared at top level in {" and ".join(mods)}', file=sys.stderr)
        print('Rename one of them so the bundle has a single flat scope.', file=sys.stderr)
        return None

    parts = ['"use strict";']
    for name in MODULES:
        parts.append(f'\n// ===== src/{name}.js '.ljust(76, '=') + '\n')
        parts.append(bodies[name])
    # Modules are strict and scoped; the IIFE keeps both properties.
    return '(function () {\n' + '\n'.join(parts) + '\n})();'


def arcade_tag(path):
    return '<script src="' + path + '"></script>'


def main():
    bundle = build_bundle()
    if bundle is None:
        return 1

    html = read('dev.html')
    if CSS_LINK not in html or MODULE_TAG not in html:
        print('error: dev.html no longer has the expected <link>/<script> tags', file=sys.stderr)
        return 1

    missing = [t for t in [ARCADE_CSS_LINK] + [arcade_tag(x) for x in ARCADE_SCRIPTS]
               if t not in html]
    if missing:
        print('error: dev.html is missing the shared arcade tags:', file=sys.stderr)
        for m in missing:
            print('  ' + m, file=sys.stderr)
        print('Run ../tools/sync-shared.py and restore the tags in dev.html.', file=sys.stderr)
        return 1
    html = html.replace(CSS_LINK, '<style>\n' + read('styles.css').strip() + '\n</style>')
    html = html.replace(ARCADE_CSS_LINK,
                        '<style>\n' + read('shared/css/arcade.css').strip() + '\n</style>')
    for path in ARCADE_SCRIPTS:
        html = html.replace(arcade_tag(path),
                            '<script>\n// ===== ' + path + '\n'
                            + read(path).strip() + '\n</script>')
    html = html.replace(MODULE_TAG, '<script>\n' + bundle + '\n</script>')
    html = html.replace(
        '<head>',
        '<head>\n<!-- Generated by build.py from dev.html, styles.css and src/*.js. '
        'Edit those, not this file. -->', 1)

    write('index.html', html)
    write(os.path.join(DEPLOY_DIR, 'index.html'), html)
    # Tells Pages to serve the folder verbatim instead of running it through
    # Jekyll. Only matters for branch-based deploys, but it costs nothing.
    write(os.path.join(DEPLOY_DIR, '.nojekyll'), '')
    write(os.path.join(DEPLOY_DIR, '404.html'), NOT_FOUND)
    write(os.path.join(DEPLOY_DIR, 'CNAME'), CUSTOM_DOMAIN + '\n')

    kb = len(html.encode('utf-8')) / 1024
    print(f'wrote index.html and {DEPLOY_DIR}/index.html  ({kb:.0f} KB, '
          f'{len(MODULES)} modules + {len(ARCADE_SCRIPTS)} shared arcade files inlined)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
