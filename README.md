# CivLab BR — Grafo do Governo Federal

Site estático (inspirado em https://graph.civlab.org/) com **senadores (81)**, **deputados federais (513)** e **membros do Poder Executivo federal** do Brasil.

## Estrutura

- `index.html` — página única (busca global, abas, filtros por UF/partido, modal de perfil)
- `assets/css/style.css`, `assets/js/app.js`
- `data/senadores.json`, `data/deputados.json`, `data/executivo.json`, `data/meta.json`
- `scripts/fetch_data.py` — busca dados reais das APIs oficiais

## Fontes

- Senado: `https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json`
- Câmara: `https://dadosabertos.camara.leg.br/api/v2/deputados`
- Executivo: curadoria a partir de gov.br/Planalto + DOU + Wikipédia, atualizada em set/2026 (pós-desincompatibilização abril/2026 para eleições). Sempre confira no DOU.

## Uso

```bash
python3 scripts/fetch_data.py
python3 -m http.server 8000
# http://localhost:8000
```

Hospedagem: qualquer host estático (GitHub Pages, Netlify, S3+CloudFront). Sem build, sem chaves.

## Aviso

Projeto independente, sem afiliação com o Governo Federal. Fotos: Senado, Câmara, gov.br.
