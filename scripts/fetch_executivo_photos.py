#!/usr/bin/env python3
"""Fetch Executivo portraits: pt.wikipedia pageimage first, then Commons search.

Saves to assets/img/executivo/<slug>.jpg and updates data/executivo.json with:
  foto_local  (relative path or "")
  foto_source (commons/wikipedia file page URL for attribution, or "")
"""
import json, os, re, time, unicodedata, urllib.request, urllib.parse

BASE = os.getcwd()
IMG_EXE = os.path.join(BASE, "assets", "img", "executivo")
UA = {"User-Agent": "civlab-br/1.0 (static civic site)"}

def slugify(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s

def api(url, params, timeout=30):
    q = urllib.parse.urlencode(params)
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url + "?" + q, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 429:
                wait = 20 * (attempt + 1)
                print(f"   429, aguardando {wait}s (tentativa {attempt+1}/4)...")
                time.sleep(wait)
                continue
            raise
    raise last

def wiki_pageimage(name):
    """Exact-title lookup on pt.wikipedia, returns (thumb_url, file_page)."""
    try:
        data = api("https://pt.wikipedia.org/w/api.php", {
            "action": "query", "format": "json", "titles": name,
            "prop": "pageimages", "pithumbsize": 500, "pilicense": "any",
        })
        for pg in data.get("query", {}).get("pages", {}).values():
            if "missing" in pg:
                return None
            th = pg.get("thumbnail", {}).get("source")
            if th:
                return (th, f"https://pt.wikipedia.org/wiki/{urllib.parse.quote(name.replace(' ', '_'))}")
    except Exception as e:
        print(f"   wiki err {name}: {e}")
    return None

def commons_search(name):
    """Full-text Commons search for a portrait, returns (thumb_url, file_page)."""
    try:
        data = api("https://commons.wikimedia.org/w/api.php", {
            "action": "query", "format": "json", "generator": "search",
            "gsrsearch": f"{name} filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 10,
            "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": 500,
        })
        pages = data.get("query", {}).get("pages", {}).values() if data.get("query") else []
        cands = []
        for p in pages:
            info = (p.get("imageinfo") or [{}])[0]
            mime = info.get("mime", "")
            if not mime.startswith("image/") or "svg" in mime:
                continue
            if (info.get("width") or 0) < 150 or (info.get("height") or 0) < 150:
                continue
            thumb = info.get("thumburl") or info.get("url")
            cands.append((p.get("title", ""), thumb))
        if not cands:
            return None
        # prefer title containing last surname
        surname = name.strip().split()[-1].lower()
        cands.sort(key=lambda c: (surname not in unicodedata.normalize("NFD", c[0]).encode("ascii", "ignore").decode().lower(), c[0]))
        title, thumb = cands[0]
        return (thumb, f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}")
    except Exception as e:
        print(f"   commons err {name}: {e}")
    return None

def download(url, dest, timeout=60):
    if os.path.exists(dest) and os.path.getsize(dest) > 2000:
        return True
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
    if len(b) < 2000 or b[:2] != b"\xff\xd8":
        # could be png/webp from thumbs; accept common magic bytes
        if not (b[:8] == b"\x89PNG\r\n\x1a\n" or b[:4] == b"RIFF"):
            raise RuntimeError(f"unexpected content ({len(b)} bytes)")
    tmp = dest + ".tmp"
    with open(tmp, "wb") as f:
        f.write(b)
    os.replace(tmp, dest)
    return True

def main():
    os.makedirs(IMG_EXE, exist_ok=True)
    exe = json.load(open("data/executivo.json", encoding="utf-8"))
    found, missing = 0, []
    for e in exe:
        nome = e["nome"]
        slug = slugify(nome)
        dest = os.path.join(IMG_EXE, slug + ".jpg")
        got = None
        if not (os.path.exists(dest) and os.path.getsize(dest) > 2000):
            got = wiki_pageimage(nome) or commons_search(nome)
            if got:
                try:
                    download(got[0], dest)
                except Exception as ex:
                    print(f"   download FAIL {nome}: {ex}")
                    got = None
            time.sleep(2.5)
        else:
            got = ("cached", e.get("foto_source", ""))
        if os.path.exists(dest) and os.path.getsize(dest) > 2000:
            e["foto_local"] = f"assets/img/executivo/{slug}.jpg"
            if got and got[1]:
                e["foto_source"] = got[1] if got[0] != "cached" else e.get("foto_source", "")
            found += 1
            print(f"OK   {nome} -> {e['foto_local']}")
        else:
            e["foto_local"] = ""
            missing.append(nome)
            print(f"--   {nome}: sem retrato encontrado (iniciais como fallback)")
    e0 = exe  # noqa
    json.dump(exe, open("data/executivo.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n{found}/{len(exe)} retratos locais; sem foto: {len(missing)}")
    for m in missing:
        print("   falta:", m)

if __name__ == "__main__":
    main()
