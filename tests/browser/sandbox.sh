#!/bin/sh
# Builds a token-free copy of the app to click through safely: a stub config.js, a fake Home Assistant and the smoke suite.
# Usage: tests/browser/sandbox.sh [destination]    (default: $TMPDIR/family-dashboard-sandbox)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DEST="${1:-${TMPDIR:-/tmp}/family-dashboard-sandbox}"

mkdir -p "$DEST/js" "$DEST/data"
cp "$ROOT/index.html" "$ROOT/styles.css" "$DEST/"
cp "$ROOT/js/bundle.js" "$DEST/js/"
cp "$ROOT/data/dashboard-data.json" "$DEST/data/"
cp "$HERE/mock-ha.js" "$HERE/smoke.js" "$DEST/"
python3 "$HERE/make-config.py" "$ROOT/data/dashboard-data.json" > "$DEST/config.js"
python3 - "$DEST/index.html" <<'PY'
import re, sys
path = sys.argv[1]
html = open(path, encoding='utf-8').read()
html = re.sub(r'(<script src="config\.js[^"]*"></script>)', r'<script src="mock-ha.js"></script>\n  \1', html, count=1)
html = re.sub(r'(<script src="js/bundle\.js[^"]*"></script>)', r'\1\n  <script src="smoke.js"></script>', html, count=1)
open(path, 'w', encoding='utf-8').write(html)
PY
echo "Sandbox ready in $DEST"
echo "Serve it:  python3 -m http.server 8766 --directory \"$DEST\""
echo "Then open http://localhost:8766/ and run  await __smoke()  in the browser console."
