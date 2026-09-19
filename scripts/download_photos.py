#!/usr/bin/env python3
"""Download Senado + Camara official photos to assets/img/ (local hosting).

Usage: python3 scripts/download_photos.py [--executivo-only]
Rewrites data/*.json adding:
  foto_local   -> relative path like assets/img/senadores/5672.jpg (or "" if failed)
  foto_remote  -> original official URL (kept as fallback)
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = os.getcwd()
IMG_SEN = os.path.join(BASE, "assets", "img", "senadores")
IMG_DEP = os.path.join(BASE, "assets", "img", "deputados")
IMG_EXE = os.path.join(BASE, "assets", "img", "executivo")

UA = {"User-Agent": "civlab-br/1.0 (contato: site estatico; +https://github.com)"}

def fetch(url, timeout=30, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                return r.read()
        except Exception as e:
            last = e
            time.sleep(1 + i)
    raise last

def is_jpeg(b):
    return len(b) > 2000 and b[:2] == b"\xff\xd8"

def dl(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 2000:
        return "cached"
    try:
        b = fetch(url)
    except Exception as e:
        return f"FAIL download: {e}"
    if not is_jpeg(b):
        return f"FAIL not-jpeg ({len(b)} bytes)"
    tmp = dest + ".tmp"
    with open(tmp, "wb") as f:
        f.write(b)
    os.replace(tmp, dest)
    return "ok"

def job(args):
    url, dest = args
    return (dest, dl(url, dest))

def run_jobs(jobs, workers=12):
    stats = {"ok": 0, "cached": 0, "fail": []}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for dest, res in ex.map(job, jobs):
            if res == "ok":
                stats["ok"] += 1
            elif res == "cached":
                stats["cached"] += 1
            else:
                stats["fail"].append(f"{dest}: {res}")
    return stats

def main():
    only_exe = "--executivo-only" in sys.argv
    os.makedirs(IMG_SEN, exist_ok=True)
    os.makedirs(IMG_DEP, exist_ok=True)
    os.makedirs(IMG_EXE, exist_ok=True)

    if not only_exe:
        sen = json.load(open("data/senadores.json", encoding="utf-8"))
        dep = json.load(open("data/deputados.json", encoding="utf-8"))

        print(f"Senadores: {len(sen)} fotos...", flush=True)
        st = run_jobs([(s["foto"], os.path.join(IMG_SEN, f"{s['codigo']}.jpg")) for s in sen if s.get("foto")])
        print(f"  ok={st['ok']} cached={st['cached']} fail={len(st['fail'])}", flush=True)
        for f in st["fail"][:20]:
            print("   ", f)

        print(f"Deputados: {len(dep)} fotos...", flush=True)
        st = run_jobs([(d["foto"], os.path.join(IMG_DEP, f"{d['id']}.jpg")) for d in dep if d.get("foto")])
        print(f"  ok={st['ok']} cached={st['cached']} fail={len(st['fail'])}", flush=True)
        for f in st["fail"][:20]:
            print("   ", f)

        # rewrite JSONs with foto_local + foto_remote
        for s in sen:
            dest = os.path.join(IMG_SEN, f"{s['codigo']}.jpg")
            s["foto_remote"] = s.get("foto", "")
            s["foto_local"] = f"assets/img/senadores/{s['codigo']}.jpg" if os.path.exists(dest) and os.path.getsize(dest) > 2000 else ""
        for d in dep:
            dest = os.path.join(IMG_DEP, f"{d['id']}.jpg")
            d["foto_remote"] = d.get("foto", "")
            d["foto_local"] = f"assets/img/deputados/{d['id']}.jpg" if os.path.exists(dest) and os.path.getsize(dest) > 2000 else ""
        json.dump(sen, open("data/senadores.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        json.dump(dep, open("data/deputados.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("data/senadores.json + data/deputados.json atualizados com foto_local/foto_remote")

if __name__ == "__main__":
    main()
