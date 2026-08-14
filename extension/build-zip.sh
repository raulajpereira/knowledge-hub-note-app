#!/usr/bin/env bash
# Packages this extension folder into client/public/extension/knowledge-hub-clipper.zip,
# which the client app serves statically and offers as a download from Settings
# (same pattern as the user-manual PDFs in client/public/manual/). Run this
# after any change under extension/ and commit the regenerated zip.
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$EXT_DIR/../client/public/extension"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/knowledge-hub-clipper.zip"

# No wrapper directory inside the zip: manifest.json sits at the zip root.
# Both Windows' "Extract All" and macOS' Archive Utility already create a
# folder named after the zip on extraction — wrapping the contents in a
# same-named folder ourselves would double-nest manifest.json one level
# deeper than where the user points "Load unpacked", which is exactly the
# "manifest file is missing" error users hit.
(cd "$EXT_DIR" && zip -r -X "$OUT_DIR/knowledge-hub-clipper.zip" . -x "*.DS_Store" -x "build-zip.sh" >/dev/null)

echo "==> Wrote $OUT_DIR/knowledge-hub-clipper.zip"
