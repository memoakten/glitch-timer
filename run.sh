#!/bin/sh
# Serve from the app's folder, regardless of the caller's working directory.
set -eu

usage() {
  echo "Usage: $0 [port: 1-65535]" >&2
  exit 1
}

[ "$#" -le 1 ] || usage
port=${1:-8000}
case "$port" in
  ''|*[!0-9]*|??????*) usage ;;
esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || usage

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install it, then run this script again." >&2
  exit 1
fi

cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
printf 'Lightning Timer: http://localhost:%s\nPress Ctrl+C to stop.\n' "$port"
exec python3 -m http.server "$port" --bind 127.0.0.1
