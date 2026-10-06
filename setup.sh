#!/usr/bin/env bash
# One-command environment setup for a fresh Codespace (or any Ubuntu box).
#   ./setup.sh          headless tools + Python client (enough for the pipeline)
#   ./setup.sh --gui    also download the openLCA desktop app (for GUI spot checks)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

need_java() {
  command -v java >/dev/null || return 0
  v=$(java -version 2>&1 | grep -oE 'version "[0-9]+' | grep -oE '[0-9]+$')
  [ "${v:-0}" -lt 21 ]
}
if need_java || ! command -v mvn >/dev/null; then
  echo "== installing Java 21 and Maven"
  sudo apt-get update -qq
  sudo apt-get install -y -qq openjdk-21-jdk-headless maven
  # make Java 21 the default if several versions exist
  J21=$(ls -d /usr/lib/jvm/java-21-openjdk-* | head -1)
  export JAVA_HOME="$J21" PATH="$J21/bin:$PATH"
  grep -q "java-21" ~/.bashrc 2>/dev/null || echo "export JAVA_HOME=$J21; export PATH=\$JAVA_HOME/bin:\$PATH" >> ~/.bashrc
fi
java -version 2>&1 | head -1

echo "== downloading openLCA 2.6.2 server libraries from Maven Central"
mvn -q -f tools/pom.xml dependency:copy-dependencies -DoutputDirectory="$HERE/tools/lib"
ls tools/lib | grep -E "olca-(core|ipc|io)"

echo "== installing the Python client"
pip install -q olca-ipc==2.6.3 olca-schema==2.6.2 2>/dev/null \
  || pip install -q --break-system-packages olca-ipc==2.6.3 olca-schema==2.6.2
python3 -c "import olca_ipc, olca_schema; print('olca-ipc OK')"

if [ "${1:-}" = "--gui" ]; then
  echo "== downloading the openLCA desktop app (2.6.2, Linux)"
  if [ ! -d openLCA ]; then
    wget -q -O openLCA.tar.gz "https://share.greendelta.com/index.php/s/Yir8IVaoTe61Uqv/download" \
      || { echo "download link is stale, get the Linux link from https://www.openlca.org/download/"; exit 1; }
    tar -xzf openLCA.tar.gz && chmod +x openLCA/openLCA
  fi
  echo "start it with: cd openLCA && ./openLCA   (shows up in the port 6080 desktop tab)"
fi

cat << 'MSG'

Setup done. Next:
  ./olca.sh restore  <file.zolca> <db name>      (for example the ELCD backup)
  ./olca.sh import-ilcd <export.zip> <db name>   (for EF 3.1, checks completeness first)
  ./olca.sh server   <db name>
  python3 ab_test.py --method "<method name>" <process id> ...
  python3 extract_ef.py config/<config>.json
MSG
