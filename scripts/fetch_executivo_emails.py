#!/usr/bin/env python3
"""Collect institutional (gabinete) emails for Executivo members from gov.br.

For each ministry, tries quem-e-quem / gabinete pages, extracts *.gov.br
emails, prefers agenda/gabinete/gm addresses. Writes into data/executivo.json:
  email, email_tipo ('gabinete'), email_source (page URL)

Usage: python3 scripts/fetch_executivo_emails.py
Re-runnable: never overwrites an existing email unless --force.
"""
import json, os, re, sys, time, urllib.request, urllib.error

BASE = os.getcwd()
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}

# keyword -> (gov.br slugs, exact minister/gabinete pages to try first)
# matched against orgao + cargo (lowercased, accent-insensitive)
TARGETS = [
    ("fazenda", ["fazenda"], [], "fazenda.gov.br"),
    ("planejamento", ["planejamento", "mpor-planejamento"], [], "planejamento.gov.br"),
    ("gestao", ["gestao"], [], "gestao.gov.br"),
    ("mdic", ["mdic"], [], "mdic.gov.br"),
    ("industria, comercio", ["mdic"], [], "mdic.gov.br"),
    ("agricultura e pecuaria", ["agricultura"], [], "agro.gov.br"),
    ("mda", ["mda"], [], "mda.gov.br"),
    ("desenvolvimento agrario", ["mda"], [], "mda.gov.br"),
    ("educacao", ["educacao", "mec"], [], "mec.gov.br"),
    ("mcti", ["mcti"], [], "mcti.gov.br"),
    ("ciencia", ["mcti"], [], "mcti.gov.br"),
    ("comunicacoes", ["mcom"], [], "mcom.gov.br"),
    ("cultura", ["cultura"], [], "cultura.gov.br"),
    ("defesa", ["defesa"], [], "defesa.gov.br"),
    ("mds", ["mds"], [], "mds.gov.br"),
    ("assistencia social", ["mds"], [], "mds.gov.br"),
    ("mdhc", ["mdh"], [], "mdh.gov.br"),
    ("direitos humanos", ["mdh"], [], "mdh.gov.br"),
    ("empreendedorismo", ["empreendedorismo"], [], "mdic.gov.br"),
    ("esporte", ["esporte"], [
        "https://www.gov.br/esporte/pt-br/composicao/Gabinete-do-Ministro/paulo-henrique-perna-cordeiro",
    ], "esporte.gov.br"),
    ("mir", ["igualdaderacial"], [
        "https://www.gov.br/igualdaderacial/pt-br/composicao/gabinete-da-ministra/rachel-barros-de-oliveira",
        "https://www.gov.br/igualdaderacial/pt-br/composicao/quem-e-quem",
    ], "igualdaderacial.gov.br"),
    ("igualdade racial", ["igualdaderacial"], [
        "https://www.gov.br/igualdaderacial/pt-br/composicao/gabinete-da-ministra/rachel-barros-de-oliveira",
    ], "igualdaderacial.gov.br"),
    ("midr", ["mdr", "midr"], [], "mdr.gov.br"),
    ("integracao", ["mdr", "midr"], [], "mdr.gov.br"),
    ("mjsp", ["mj"], [], "mj.gov.br"),
    ("justica", ["mj"], [], "mj.gov.br"),
    ("mma", ["mma"], [], "mma.gov.br"),
    ("meio ambiente", ["mma"], [], "mma.gov.br"),
    ("mme", ["mme"], [], "mme.gov.br"),
    ("minas e energia", ["mme"], [], "mme.gov.br"),
    ("mulheres", ["mulheres"], [], "mulheres.gov.br"),
    ("mpa", ["mpa"], [
        "https://www.gov.br/mpa/pt-br/acesso-a-informacao/institucional/quem-e-quem-3/gabinete-do-ministro/ministro",
        "https://www.gov.br/mpa/pt-br/acesso-a-informacao/institucional/quem-e-quem-3",
    ], "mpa.gov.br"),
    ("pesca", ["mpa"], [
        "https://www.gov.br/mpa/pt-br/acesso-a-informacao/institucional/quem-e-quem-3/gabinete-do-ministro/ministro",
    ], "mpa.gov.br"),
    ("mpor", ["portos-e-aeroportos"], [
        "https://www.gov.br/portos-e-aeroportos/pt-br/composicao/autoridades-1/tome-monteiro-da-franca",
        "https://www.gov.br/portos-e-aeroportos/pt-br/composicao/autoridades-1",
    ], "mpor.gov.br"),
    ("portos", ["portos-e-aeroportos"], [
        "https://www.gov.br/portos-e-aeroportos/pt-br/composicao/autoridades-1/tome-monteiro-da-franca",
    ], "mpor.gov.br"),
    ("mpi", ["povosindigenas", "mpi"], [], "mpi.gov.br"),
    ("indigenas", ["povosindigenas", "mpi"], [], "mpi.gov.br"),
    ("previdencia", ["previdencia"], [], "previdencia.gov.br"),
    ("mre", ["mre"], [], "itamaraty.gov.br"),
    ("exteriores", ["mre"], [], "itamaraty.gov.br"),
    ("saude", ["saude"], [], "saude.gov.br"),
    ("mte", ["trabalho-e-emprego", "trabalho"], [], "trabalho.gov.br"),
    ("trabalho", ["trabalho-e-emprego", "trabalho"], [], "trabalho.gov.br"),
    ("transportes", ["transportes"], [], "transportes.gov.br"),
    ("turismo", ["turismo"], [], "turismo.gov.br"),
    ("cidades", ["cidades"], [], "cidades.gov.br"),
    ("casa civil", ["casacivil"], [], "presidencia.gov.br"),
    ("secretaria-geral", ["secretariageral", "secretaria-geral"], [], "presidencia.gov.br"),
    ("sri", ["sri"], [], "presidencia.gov.br"),
    ("relacoes institucionais", ["sri"], [], "presidencia.gov.br"),
    ("secom", ["secom"], [], "presidencia.gov.br"),
    ("comunicacao social", ["secom"], [], "presidencia.gov.br"),
    ("agu", ["agu"], [], "agu.gov.br"),
    ("advocacia", ["agu"], [], "agu.gov.br"),
    ("cgu", ["cgu"], [], "cgu.gov.br"),
    ("controladoria", ["cgu"], [], "cgu.gov.br"),
    ("gsi", ["gsi"], [], "presidencia.gov.br"),
    ("seguranca institucional", ["gsi"], [], "presidencia.gov.br"),
]

PATH_TEMPLATES = [
    "https://www.gov.br/{slug}/pt-br/acesso-a-informacao/institucional/quem-e-quem",
    "https://www.gov.br/{slug}/pt-br/composicao/quem-e-quem",
    "https://www.gov.br/{slug}/pt-br/composicao/gabinete-do-ministro",
    "https://www.gov.br/{slug}/pt-br/acesso-a-informacao/institucional/quem-e-quem-2",
    "https://www.gov.br/{slug}/pt-br/acesso-a-informacao/institucional/quem-e-quem-3",
]

SKIP_DOMAINS = ("exemplo", "saude.gov.brx")
OUVIDORIA_HINTS = ("ouvidoria", "sic.", "fala.br", "transparencia")

def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="ignore")

def extract_emails(html):
    found = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", html)
    out = []
    for m in found:
        ml = m.lower()
        if not ml.endswith(".gov.br"):
            continue
        if any(s in ml for s in SKIP_DOMAINS):
            continue
        if m not in out:
            out.append(m)
    return out

def rank(emails, domain_hint=""):
    def score(e):
        el = e.lower()
        if domain_hint and el.endswith("@" + domain_hint):
            return (-1, e)
        if any(h in el for h in OUVIDORIA_HINTS):
            return (2, e)
        if any(k in el for k in ("agenda", "gab", "gabinete", "gm.", "gm@", ".gm", "ministro", "chefia")):
            return (0, e)
        return (1, e)
    return sorted(emails, key=score)

def emails_near_name(html, nome, window=2500):
    """Emails appearing close to the minister's name/surname in the page."""
    folds = ascii_fold(html)
    needles = [ascii_fold(nome)]
    parts = ascii_fold(nome).split()
    if len(parts) >= 2:
        needles.append(parts[0] + " " + parts[-1])  # first + last
        needles.append(parts[-1])  # surname
    spans = []
    for n in needles:
        start = 0
        while True:
            i = folds.find(n, start)
            if i < 0:
                break
            spans.append((max(0, i - window), i + len(n) + window))
            start = i + len(n)
            if len(spans) > 12:
                break
        if spans:
            break
    if not spans:
        return []
    # map folded offsets back approximately (folding only removes ~5% chars;
    # search emails in the raw html slices around proportional positions)
    out = []
    ratio = len(html) / max(1, len(folds))
    for a, b in spans:
        chunk = html[int(a * ratio):int(b * ratio)]
        for m in extract_emails(chunk):
            if m not in out:
                out.append(m)
    return out

def pick(emails):
    mails = rank(emails)
    mails = [m for m in mails if not any(h in m.lower() for h in OUVIDORIA_HINTS)] or mails
    return mails[0] if mails else None

def ascii_fold(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")

def candidates_for(orgao, cargo):
    global _HINT
    _HINT = ""
    hay = ascii_fold(f"{orgao} {cargo}")
    for kw, slugs, exact, _domain in TARGETS:
        if kw in hay:
            _HINT = _domain
            urls = list(exact)
            for slug in slugs:
                for t in PATH_TEMPLATES:
                    u = t.format(slug=slug)
                    if u not in urls:
                        urls.append(u)
            return urls
    return []

GAB_KEYWORDS = ("agenda", "gab", "gabinete", "gm.", "gm@", ".gm", "ministro", "ministra", "chefia")

def is_gabinete(e):
    return any(k in e.lower() for k in GAB_KEYWORDS)

def sub_links(html, base):
    """Internal gabinete/ministro sub-page links (same gov.br ministry host)."""
    m = re.search(r"https://www\.gov\.br/[a-z0-9-]+", base)
    if not m:
        return []
    host = m.group(0)
    out = []
    for href in re.findall(r'href="(%s/[^"]+)"' % re.escape(host), html):
        h = href.lower()
        if any(k in h for k in ("gabinete", "ministro", "ministra", "autoridades", "quemequem", "quem-e-quem")):
            if href not in out:
                out.append(href)
    return out[:4]

def try_page(url, nome, minister_page):
    """Fetch one page; return (chosen, alts) or (None, []) preserving _HINT."""
    try:
        html = fetch(url)
    except urllib.error.HTTPError as ex:
        if ex.code == 429:
            print("   429, esperando 60s...")
            time.sleep(60)
            try:
                html = fetch(url)
            except Exception:
                return None, [], ""
        else:
            return None, [], ""
    except Exception:
        return None, [], ""
    near = emails_near_name(html, nome)
    union = list(near)
    for m in extract_emails(html):
        if m not in union:
            union.append(m)
    ranked = rank(union, _HINT)
    # Only gabinete-like addresses are acceptable (never regional/personal ones).
    # On minister-specific pages, the ministry's own domain wins over
    # near-name noise from unrelated blocks.
    hinted_page = [m for m in union if _HINT and m.lower().endswith("@" + _HINT) and is_gabinete(m)]
    if minister_page and hinted_page:
        chosen = pick(hinted_page)
    else:
        hinted = [m for m in near if _HINT and m.lower().endswith("@" + _HINT) and is_gabinete(m)]
        pool = hinted or [m for m in near if is_gabinete(m)]
        chosen = pick(pool) if pool else None
        if not chosen and minister_page:
            chosen = pick([m for m in ranked if is_gabinete(m)])
    if chosen and not is_gabinete(chosen):
        chosen = None
    alts = [x for x in ranked if x != chosen][:3]
    return chosen, alts, html

def main():
    force = "--force" in sys.argv
    exe = json.load(open("data/executivo.json", encoding="utf-8"))
    for e in exe:
        if e.get("email") and not force:
            print(f"keep  {e['nome']} <{e['email']}>")
            continue
        orgao = e.get("orgao", "")
        nome = e.get("nome", "")
        got = None
        seen = set()
        index_htmls = []

        def attempt(url, minister_page):
            if url in seen:
                return None
            seen.add(url)
            chosen, alts, html = try_page(url, nome, minister_page)
            if html:
                index_htmls.append((url, html))
            if chosen:
                return (chosen, url, alts)
            return None

        urls = candidates_for(orgao, e.get("cargo", ""))
        for u in urls:
            if got:
                break
            minister_page = any(k in u for k in ("ministro/", "ministra/", "gabinete-do-ministro/", "autoridades-1/"))
            got = attempt(u, minister_page)
            time.sleep(2)
        # second pass: crawl gabinete/ministro sub-pages linked from indexes
        if not got:
            for base, html in index_htmls:
                if got:
                    break
                for sub in sub_links(html, base):
                    if got:
                        break
                    time.sleep(2)
                    got = attempt(sub, True)
        if got:
            e["email"], e["email_source"], e["email_alt"] = got[0], got[1], got[2]
            e["email_tipo"] = "gabinete"
            print(f"OK    {e['nome']} <{got[0]}>  ({orgao})")
        else:
            print(f"--    {e['nome']}: nenhum email institucional encontrado ({orgao})")
        time.sleep(3)
    json.dump(exe, open("data/executivo.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    n = sum(1 for e in exe if e.get("email"))
    print(f"\n{n}/{len(exe)} com email")

if __name__ == "__main__":
    main()
