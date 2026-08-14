#!/usr/bin/env bash
# Packages this extension folder into client/public/extension/knowledge-hub-clipper.zip,
# which the client app serves statically and offers as a download from Settings
# (same pattern as the user-manual PDFs in client/public/manual/). Run this
# after any change under extension/ and commit the regenerated zip.
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$EXT_DIR/../client/public/extension"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/knowledge-hub-clipper" "$OUT_DIR"
cp -r "$EXT_DIR"/* "$STAGE/knowledge-hub-clipper/"
rm -f "$OUT_DIR/knowledge-hub-clipper.zip"

(cd "$STAGE" && zip -r -X "$OUT_DIR/knowledge-hub-clipper.zip" knowledge-hub-clipper -x "*.DS_Store" >/dev/null)

echo "==> Wrote $OUT_DIR/knowledge-hub-clipper.zip"
