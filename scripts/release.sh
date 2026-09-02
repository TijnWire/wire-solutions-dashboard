#!/usr/bin/env bash
# release.sh — hoog de app-versie op één plek op en houd de service-worker-cache automatisch gelijk.
#
# Waarom: de zichtbare versie (src/lib/versie.ts) en de sw-cache (public/sw.js) moesten met de hand
# allebei worden opgehoogd. Vergeet je er één, dan krijgt het team geen auto-update of zien ze een
# verkeerd versienummer. Dit script doet beide in één keer, en verhoogt de sw-cache altijd mee.
#
# Gebruik:
#   scripts/release.sh 18.3      # zet app-versie op 18.3, sw-cache +1
#   scripts/release.sh           # patch-bump (18.2 -> 18.3), sw-cache +1
#
# Daarna zelf: npm run build && git commit && git push  (het script wijzigt alleen de 2 versiebestanden).

set -euo pipefail
cd "$(dirname "$0")/.."

VERSIE_FILE="src/lib/versie.ts"
SW_FILE="public/sw.js"

# Huidige waarden lezen
huidig_app=$(grep -oE 'APP_VERSIE = "[0-9.]+"' "$VERSIE_FILE" | grep -oE '[0-9.]+')
huidig_sw=$(grep -oE 'wire-cache-v[0-9]+' "$SW_FILE" | grep -oE '[0-9]+')

# Nieuwe app-versie: argument, of patch-bump van de huidige (laatste getal +1)
if [ $# -ge 1 ]; then
  nieuw_app="$1"
else
  major=$(echo "$huidig_app" | cut -d. -f1)
  minor=$(echo "$huidig_app" | cut -d. -f2)
  nieuw_app="${major}.$((minor + 1))"
fi
nieuw_sw=$((huidig_sw + 1))

# Vervangen (in-place). BSD/GNU-sed-veilig via een tijdelijk bestand.
tmp=$(mktemp)
sed -E "s/APP_VERSIE = \"[0-9.]+\"/APP_VERSIE = \"${nieuw_app}\"/" "$VERSIE_FILE" > "$tmp" && mv "$tmp" "$VERSIE_FILE"
tmp=$(mktemp)
sed -E "s/wire-cache-v[0-9]+/wire-cache-v${nieuw_sw}/" "$SW_FILE" > "$tmp" && mv "$tmp" "$SW_FILE"

echo "App-versie : ${huidig_app} -> ${nieuw_app}"
echo "SW-cache   : v${huidig_sw} -> v${nieuw_sw}"
echo ""
echo "Volgende stap: npm run build && git add -A && git commit -m \"...(V${nieuw_app})\" && git push"
