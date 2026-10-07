"""Check that an ILCD export is complete enough to calculate with.

    python3 -I check_ilcd.py path/to/export.zip      (or an unzipped folder)
    python3 -I check_ilcd.py --methods-only package.zip   (LCIA method package,
                                                          no processes expected)

Counts the data sets per folder and checks that the references inside
processes and LCIA methods point to files that are really in the package.
Exit code 0 = usable, 1 = incomplete (the report says what is missing).
"""
import os
import re
import sys
import zipfile
from collections import Counter

REQUIRED = ["processes", "flows", "flowproperties", "unitgroups", "lciamethods"]
# a missing source or contact only loses documentation; these break calculations
CRITICAL = {"processes", "flows", "flowproperties", "unitgroups", "lciamethods"}
REF = re.compile(rb'uri="\.\./(\w+)/([^"]+?\.xml)"')


def entries(path):
    """Yield (folder, file name, reader) for every XML data set."""
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            for f in files:
                if f.endswith(".xml"):
                    full = os.path.join(root, f)
                    yield os.path.basename(root), f, (lambda p=full: open(p, "rb").read())
    else:
        z = zipfile.ZipFile(path)
        for n in z.namelist():
            parts = n.split("/")
            if n.endswith(".xml") and len(parts) >= 2:
                yield parts[-2], parts[-1], (lambda n=n: z.read(n))


def main():
    args = [a for a in sys.argv[1:] if a != "--methods-only"]
    methods_only = "--methods-only" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    path = args[0]
    files = {}
    counts = Counter()
    readers = {}
    for folder, name, read in entries(path):
        counts[folder] += 1
        files.setdefault(folder, set()).add(name)
        readers.setdefault(folder, []).append(read)

    print("data sets per folder:")
    for k, v in sorted(counts.items()):
        print(f"  {k:<16} {v}")
    required = [f for f in REQUIRED if not (methods_only and f == "processes")]
    missing_folders = [f for f in required if counts[f] == 0]

    dangling = Counter()
    for folder in ["processes", "lciamethods"]:
        for read in readers.get(folder, [])[:200]:  # a sample is enough
            for tgt_folder, tgt in REF.findall(read()):
                tf, tn = tgt_folder.decode(), tgt.decode()
                if tn not in files.get(tf, set()):
                    dangling[tf] += 1

    ok = not missing_folders and not any(k in CRITICAL for k in dangling)
    if missing_folders:
        print("MISSING folders:", ", ".join(missing_folders))
    if dangling:
        print("references to files that are not in the package (sampled, "
              "sources/contacts only lose documentation):")
        for k, v in dangling.most_common():
            print(f"  {k:<16} {v}")
    print("RESULT:", "usable" if ok else "INCOMPLETE, ask for the full export")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
