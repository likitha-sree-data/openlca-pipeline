#!/usr/bin/env bash
# Headless openLCA 2.6.2 helpers (no GUI needed). Run ./setup.sh once first.
#
#   ./olca.sh restore  <file.zolca> <db>     restore an openLCA backup
#   ./olca.sh import-ilcd <zip|folder> <db>  import an ILCD export (EF 3.1)
#   ./olca.sh counts   <db>                  how many processes, flows, ...
#   ./olca.sh server   <db> [port]           start the IPC server in the background
#   ./olca.sh stop                           stop the IPC server
#
# Databases live in $OLCA_DATA/databases (default ~/openLCA-data-1.4, the
# same folder the openLCA desktop app uses, so the GUI sees them too).
# A database can only be open in ONE program at a time: stop the server
# before using the GUI on the same database, and the other way round.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="${OLCA_DATA:-$HOME/openLCA-data-1.4}"
LIB="$HERE/tools/lib"
PIDFILE="$DATA/ipc-server.pid"
mkdir -p "$DATA/databases"

[ -d "$LIB" ] || { echo "tools/lib missing, run ./setup.sh first"; exit 1; }
tool() { java -Xmx"${OLCA_MEM:-4g}" -Ddata="$DATA" -cp "$LIB/*" "$HERE/tools/OlcaTool.java" "$@"; }

case "${1:-}" in
  restore|import-ilcd)
    [ $# -eq 3 ] || { echo "usage: $0 $1 <file> <db>"; exit 1; }
    if [ "$1" = import-ilcd ]; then
      python3 -I "$HERE/check_ilcd.py" "$2" || { echo "refusing to import an incomplete package"; exit 1; }
    fi
    tool "$1" "$2" "$3" ;;
  counts)
    tool counts "$2" ;;
  server)
    DB="${2:?usage: $0 server <db> [port]}"; PORT="${3:-8080}"
    [ -d "$DATA/databases/$DB" ] || { echo "no database $DB in $DATA/databases"; ls "$DATA/databases"; exit 1; }
    if curl -s -o /dev/null "http://localhost:$PORT"; then
      echo "port $PORT is already in use (another IPC server, or the GUI's). Run ./olca.sh stop or close it first."; exit 1
    fi
    nohup java -Xmx"${OLCA_MEM:-4g}" -cp "$LIB/*" org.openlca.ipc.Server \
      -data "$DATA" -db "$DB" -port "$PORT" > "$DATA/ipc-server.log" 2>&1 &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 60); do
      if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "server process died, see $DATA/ipc-server.log"; tail -20 "$DATA/ipc-server.log"; exit 1
      fi
      if curl -s -X POST "http://localhost:$PORT" \
          -d '{"jsonrpc":"2.0","id":1,"method":"data/get/descriptors","params":{"@type":"ImpactMethod"}}' > /dev/null; then
        echo "IPC server running on port $PORT with database $DB (log: $DATA/ipc-server.log)"; exit 0
      fi
      sleep 2
    done
    echo "server did not start, see $DATA/ipc-server.log"; tail -20 "$DATA/ipc-server.log"; exit 1 ;;
  stop)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null && rm -f "$PIDFILE" && echo "stopped" || echo "no server running" ;;
  *)
    sed -n '2,15p' "$0"; exit 1 ;;
esac
