#!/usr/bin/env python3
"""Build the claude.ai page from index.html.

claude.ai wraps a published page in its own <!doctype>/<html>/<head>/<body>
skeleton, so the published file must contain only the page itself: the
<title> and <style> first, then the body content. index.html stays a complete
document so it still works when opened as a local file.

Usage: python3 tools/build-artifact.py   ->  writes dist/index.html
Publish dist/index.html with core.js and app.js alongside it.
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "index.html").read_text(encoding="utf-8")

head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", src, re.S).group(1)
title = re.search(r"<title>.*?</title>", head, re.S).group(0)
styles = re.findall(r"<style>.*?</style>", head, re.S)
if not styles:
    raise SystemExit("index.html has no <style> block")

out = "\n".join([title, *styles, body.strip(), ""])
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(out, encoding="utf-8")
print(f"wrote {dist / 'index.html'} ({len(out):,} bytes)")
