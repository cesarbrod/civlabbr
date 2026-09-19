#!/usr/bin/env python3
"""Crude JS brace-balance check: strip comments/strings/template literals, then count."""
import re, sys

path = sys.argv[1] if len(sys.argv) > 1 else "assets/js/app.js"
js = open(path, encoding="utf-8").read()
js = re.sub(r"//[^\n]*", "", js)
js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
# template literals (no nesting/interpolation in our file)
js = re.sub(r"`(?:\\.|[^`\\])*`", "``", js)
# strings
js = re.sub(r"'(?:\\.|[^'\\])*'", "''", js)
js = re.sub(r'"(?:\\.|[^"\\])*"', '""', js)
for a, b in [("{", "}"), ("(", ")"), ("[", "]")]:
    print(a, js.count(a), b, js.count(b))
# regex literals like /.../g may contain brackets; report candidates
for i, l in enumerate(open(path, encoding="utf-8"), 1):
    if re.search(r"/[^/\s][^/]*/[gimsuy]*", l) and ("[" in l or "{" in l):
        print("regex-literal line", i, l.strip()[:110])
