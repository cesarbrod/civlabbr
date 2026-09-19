#!/usr/bin/env python3
"""Fetch Senado + Câmara data and write normalized JSON for the static site."""
import json, urllib.request, os, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.getcwd()
# when run with cwd=civlab, BASE is civlab
OUT = os.path.join(os.getcwd(), "data")

def get_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "civlab-br/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def https(u):
    if isinstance(u, str) and u.startswith("http://"):
        return "https://" + u[len("http://"):]
    return u

def fetch_senadores():
    url = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"
    data = get_json(url)
    parl = data["ListaParlamentarEmExercicio"]["Parlamentares"]["Parlamentar"]
    out = []
    for s in parl:
        ident = s.get("IdentificacaoParlamentar", {})
        mand = s.get("Mandato", {})
        out.append({
            "codigo": ident.get("CodigoParlamentar"),
            "nome": ident.get("NomeParlamentar"),
            "nome_completo": ident.get("NomeCompletoParlamentar"),
            "partido": ident.get("SiglaPartidoParlamentar"),
            "uf": ident.get("UfParlamentar"),
            "sexo": ident.get("SexoParlamentar"),
            "foto": https(ident.get("UrlFotoParlamentar")),
            "pagina": https(ident.get("UrlPaginaParlamentar")),
            "email": ident.get("EmailParlamentar"),
            "bloco": (ident.get("Bloco") or {}).get("NomeApelido"),
            "titularidade": (mand.get("DescricaoParticipacao") or "Titular"),
        })
    out.sort(key=lambda x: (x["nome"] or ""))
    return out

def fetch_deputados():
    out = []
    pagina = 1
    while True:
        url = f"https://dadosabertos.camara.leg.br/api/v2/deputados?formato=json&itens=100&pagina={pagina}&ordem=ASC&ordenarPor=nome"
        data = get_json(url)
        dados = data.get("dados", [])
        if not dados:
            break
        for d in dados:
            out.append({
                "id": d.get("id"),
                "nome": d.get("nome"),
                "partido": d.get("siglaPartido"),
                "uf": d.get("siglaUf"),
                "foto": d.get("urlFoto"),
                "email": d.get("email"),
                "uri": d.get("uri"),
                "legislatura": d.get("idLegislatura"),
            })
        links = {l["rel"]: l["href"] for l in data.get("links", [])}
        if "next" not in links:
            break
        pagina += 1
        if pagina > 20:
            break
    out.sort(key=lambda x: x["nome"])
    return out

EXECUTIVO = [
    {"cargo": "Presidente da República", "nome": "Luiz Inácio Lula da Silva", "partido": "PT", "desde": "2023-01-01", "orgao": "Presidência da República", "foto": "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/presidencia/fotos-presidente/presidente-lula.jpg"},
    {"cargo": "Vice-Presidente da República", "nome": "Geraldo Alckmin", "partido": "PSB", "desde": "2023-01-01", "orgao": "Vice-Presidência", "foto": ""},
    {"cargo": "Ministro da Casa Civil", "nome": "Miriam Belchior", "partido": "PT", "desde": "2026-04-03", "orgao": "Casa Civil", "foto": ""},
    {"cargo": "Ministro da Fazenda", "nome": "Dario Durigan", "partido": "Sem partido", "desde": "2026-03-19", "orgao": "Ministério da Fazenda", "foto": ""},
    {"cargo": "Ministro do Planejamento e Orçamento", "nome": "Bruno Moretti", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "Ministério do Planejamento e Orçamento", "foto": ""},
    {"cargo": "Ministra da Gestão e da Inovação em Serviços Públicos", "nome": "Esther Dweck", "partido": "Sem partido", "desde": "2023-01-01", "orgao": "Ministério da Gestão e da Inovação", "foto": ""},
    {"cargo": "Ministro do Desenvolvimento, Indústria, Comércio e Serviços", "nome": "Márcio Fernando Elias Rosa", "partido": "Sem partido", "desde": "2026-04-03", "orgao": "MDIC", "foto": ""},
    {"cargo": "Ministro da Agricultura e Pecuária", "nome": "André de Paula", "partido": "PSD", "desde": "2026-04-01", "orgao": "Ministério da Agricultura e Pecuária", "foto": ""},
    {"cargo": "Ministra do Desenvolvimento Agrário e Agricultura Familiar", "nome": "Fernanda Machiaveli", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MDA", "foto": ""},
    {"cargo": "Ministro da Educação", "nome": "Leonardo Barchini", "partido": "Sem partido", "desde": "2026-04-02", "orgao": "Ministério da Educação", "foto": ""},
    {"cargo": "Ministra da Ciência, Tecnologia e Inovação", "nome": "Luciana Santos", "partido": "PCdoB", "desde": "2023-01-01", "orgao": "MCTI", "foto": ""},
    {"cargo": "Ministro das Comunicações", "nome": "Frederico Siqueira", "partido": "Sem partido", "desde": "2025-04-24", "orgao": "Ministério das Comunicações", "foto": ""},
    {"cargo": "Ministra da Cultura", "nome": "Margareth Menezes", "partido": "Sem partido", "desde": "2023-01-01", "orgao": "Ministério da Cultura", "foto": ""},
    {"cargo": "Ministro da Defesa", "nome": "José Múcio", "partido": "Sem partido", "desde": "2023-01-01", "orgao": "Ministério da Defesa", "foto": ""},
    {"cargo": "Ministro do Desenvolvimento e Assistência Social, Família e Combate à Fome", "nome": "Wellington Dias", "partido": "PT", "desde": "2023-01-01", "orgao": "MDS", "foto": ""},
    {"cargo": "Ministra dos Direitos Humanos e da Cidadania", "nome": "Janine Mello dos Santos", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MDHC", "foto": ""},
    {"cargo": "Ministro do Empreendedorismo, da Microempresa e da Empresa de Pequeno Porte", "nome": "Tadeu Alencar", "partido": "PSB", "desde": "2026-04-03", "orgao": "Ministério do Empreendedorismo", "foto": ""},
    {"cargo": "Ministro do Esporte", "nome": "Paulo Henrique Perna Cordeiro", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "Ministério do Esporte", "foto": ""},
    {"cargo": "Ministra da Igualdade Racial", "nome": "Rachel Barros de Oliveira", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MIR", "foto": ""},
    {"cargo": "Ministro da Integração e do Desenvolvimento Regional", "nome": "Waldez Góes", "partido": "PDT", "desde": "2023-01-01", "orgao": "MIDR", "foto": ""},
    {"cargo": "Ministro da Justiça e Segurança Pública", "nome": "Wellington César Lima e Silva", "partido": "Sem partido", "desde": "2026-01-13", "orgao": "MJSP", "foto": ""},
    {"cargo": "Ministro do Meio Ambiente e Mudança do Clima", "nome": "João Paulo Capobianco", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MMA", "foto": ""},
    {"cargo": "Ministro de Minas e Energia", "nome": "Alexandre Silveira", "partido": "PSD", "desde": "2023-01-01", "orgao": "MME", "foto": ""},
    {"cargo": "Ministra das Mulheres", "nome": "Márcia Lopes", "partido": "PT", "desde": "2025-05-05", "orgao": "Ministério das Mulheres", "foto": ""},
    {"cargo": "Ministra da Pesca e Aquicultura", "nome": "Rivetla Edipo Araujo Cruz", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MPA", "foto": ""},
    {"cargo": "Ministro de Portos e Aeroportos", "nome": "Tomé Barros Monteiro da Franca", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MPor", "foto": ""},
    {"cargo": "Ministro dos Povos Indígenas", "nome": "Eloy Terena", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "MPI", "foto": ""},
    {"cargo": "Ministro da Previdência Social", "nome": "Wolney Queiroz", "partido": "PDT", "desde": "2025-05-02", "orgao": "Ministério da Previdência Social", "foto": ""},
    {"cargo": "Ministro das Relações Exteriores", "nome": "Mauro Vieira", "partido": "Sem partido", "desde": "2023-01-01", "orgao": "MRE", "foto": ""},
    {"cargo": "Ministro da Saúde", "nome": "Alexandre Padilha", "partido": "PT", "desde": "2025-03-10", "orgao": "Ministério da Saúde", "foto": ""},
    {"cargo": "Ministro do Trabalho e Emprego", "nome": "Luiz Marinho", "partido": "PT", "desde": "2023-01-01", "orgao": "MTE", "foto": ""},
    {"cargo": "Ministro dos Transportes", "nome": "George Santoro", "partido": "Sem partido", "desde": "2026-04-01", "orgao": "Ministério dos Transportes", "foto": ""},
    {"cargo": "Ministro do Turismo", "nome": "Gustavo Feliciano", "partido": "Sem partido", "desde": "2025-12-23", "orgao": "Ministério do Turismo", "foto": ""},
    {"cargo": "Ministro das Cidades", "nome": "Antônio Vladimir Lima", "partido": "Sem partido", "desde": "2026-04-02", "orgao": "Ministério das Cidades", "foto": ""},
    {"cargo": "Ministro da Secretaria-Geral da Presidência", "nome": "Guilherme Boulos", "partido": "PSOL", "desde": "2025-10-29", "orgao": "Secretaria-Geral", "foto": ""},
    {"cargo": "Ministro da Secretaria de Relações Institucionais", "nome": "José Nobre Guimarães", "partido": "PT", "desde": "2026-04-14", "orgao": "SRI", "foto": ""},
    {"cargo": "Ministro da Secretaria de Comunicação Social", "nome": "Sidônio Palmeira", "partido": "PT", "desde": "2025-01-08", "orgao": "SECOM", "foto": ""},
    {"cargo": "Advogado-Geral da União", "nome": "Jorge Messias", "partido": "Sem partido", "desde": "2023-01-01", "orgao": "AGU", "foto": ""},
    {"cargo": "Ministro da Controladoria-Geral da União", "nome": "Vinicius Marques de Carvalho", "partido": "Sem partido", "desde": "2023-01-01", "orgao": "CGU", "foto": ""},
    {"cargo": "Ministro do Gabinete de Segurança Institucional", "nome": "Marcos Antonio Amaro dos Santos", "partido": "Sem partido", "desde": "2023-05-04", "orgao": "GSI", "foto": ""},
]

def main():
    os.makedirs(OUT, exist_ok=True)
    print("Fetching senadores...")
    sen = fetch_senadores()
    print(f"  {len(sen)} senadores")
    print("Fetching deputados...")
    dep = fetch_deputados()
    print(f"  {len(dep)} deputados")
    # preserve local-photo fields added by download_photos.py across re-runs
    try:
        old_sen = {s.get("codigo"): s for s in json.load(open(os.path.join(OUT, "senadores.json"), encoding="utf-8"))}
    except (FileNotFoundError, json.JSONDecodeError):
        old_sen = {}
    for s in sen:
        old = old_sen.get(s["codigo"], {})
        for k in ("foto_local", "foto_remote"):
            if old.get(k):
                s[k] = old[k]
    try:
        old_dep = {d.get("id"): d for d in json.load(open(os.path.join(OUT, "deputados.json"), encoding="utf-8"))}
    except (FileNotFoundError, json.JSONDecodeError):
        old_dep = {}
    for d in dep:
        old = old_dep.get(d["id"], {})
        for k in ("foto_local", "foto_remote"):
            if old.get(k):
                d[k] = old[k]
    with open(os.path.join(OUT, "senadores.json"), "w", encoding="utf-8") as f:
        json.dump(sen, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "deputados.json"), "w", encoding="utf-8") as f:
        json.dump(dep, f, ensure_ascii=False, indent=2)
    # preserve curated fields (photos, emails) across re-runs, matched by name
    preserve = ("foto_local", "foto_remote", "foto_source", "email", "email_alt",
                "email_source", "email_tipo")
    try:
        old_exe = {e.get("nome"): e for e in json.load(open(os.path.join(OUT, "executivo.json"), encoding="utf-8"))}
    except (FileNotFoundError, json.JSONDecodeError):
        old_exe = {}
    for e in EXECUTIVO:
        old = old_exe.get(e["nome"], {})
        for k in preserve:
            if old.get(k):
                e[k] = old[k]
    with open(os.path.join(OUT, "executivo.json"), "w", encoding="utf-8") as f:
        json.dump(EXECUTIVO, f, ensure_ascii=False, indent=2)
    meta = {
        "atualizado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "fontes": {
            "senado": "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json",
            "camara": "https://dadosabertos.camara.leg.br/api/v2/deputados",
            "executivo": "Curadoria a partir de gov.br, Diário Oficial da União e Wikipédia (Lista de membros do gabinete de Lula 2023–presente), atualizada em set/2026 pós-desincompatibilização de abril/2026"
        },
        "totais": {"senadores": len(sen), "deputados": len(dep), "executivo": len(EXECUTIVO)}
    }
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("Done:", meta["totais"])

if __name__ == "__main__":
    main()
