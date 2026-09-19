#!/usr/bin/env bash
# Atualização diária do CivLab BR.
# - Re-coleta Senado/Câmara/Executivo e fotos oficiais de novos parlamentares
# - Commita + push SOMENTE se houver mudança (o GitHub Pages republica sozinho)
# - E-mails de novos ministros continuam sendo curadoria manual
#   (scripts/fetch_executivo_emails.py); aqui só emitimos um alerta no log.
#
# Token: arquivo ~/.config/civlabbr/token (uma linha, sem newline extra importa).
#         chmod 600. Sem token, atualiza os dados locais mas não faz push.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO/logs/update.log"
LOCK="$REPO/.update.lock"
TOKEN_FILE="$HOME/.config/civlabbr/token"
REMOTE="https://github.com/cesarbrod/civlabbr"
BRANCH="main"

mkdir -p "$REPO/logs"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Is) SKIP: outra execução em andamento" >> "$LOG"
  exit 0
fi

cd "$REPO" || exit 1
echo "$(date -Is) START" >> "$LOG"

if ! python3 scripts/fetch_data.py >> "$LOG" 2>&1; then
  echo "$(date -Is) ERRO: fetch_data.py falhou" >> "$LOG"
  exit 1
fi

if ! git diff --quiet -- data/; then
  echo "$(date -Is) dados mudaram -> baixando fotos de novos parlamentares" >> "$LOG"
  python3 scripts/download_photos.py >> "$LOG" 2>&1 || echo "$(date -Is) AVISO: download_photos falhou (segue sem fotos novas)" >> "$LOG"
fi

if git diff --quiet -- data/ assets/img/; then
  echo "$(date -Is) OK: sem mudanças, nada a republicar" >> "$LOG"
  exit 0
fi

# Alerta: novos nomes no Executivo sem email curado
python3 -c "
import json
exe = json.load(open('data/executivo.json', encoding='utf-8'))
faltam = [e['nome'] for e in exe if not e.get('email') and e['nome'] not in ('Luiz Inácio Lula da Silva','Geraldo Alckmin')]
if faltam: print('ALERTA: sem email curado:', '; '.join(faltam))
" >> "$LOG" 2>&1

git add data/ assets/img/ >> "$LOG" 2>&1
git -c user.name="civlabbr-updater" -c user.email="cesar@brod.com.br" \
  commit -m "dados: atualização automática $(date +%F)" >> "$LOG" 2>&1 || {
  echo "$(date -Is) ERRO: commit falhou" >> "$LOG"; exit 1;
}

if [ ! -s "$TOKEN_FILE" ]; then
  echo "$(date -Is) SEM TOKEN ($TOKEN_FILE): commit local criado, push pendente" >> "$LOG"
  exit 0
fi
TOKEN="$(tr -d ' \t\r\n' < "$TOKEN_FILE")"
if git push "https://x-access-token:${TOKEN}@github.com/cesarbrod/civlabbr" "$BRANCH" >> "$LOG" 2>&1; then
  echo "$(date -Is) OK: republicado no GitHub Pages" >> "$LOG"
else
  echo "$(date -Is) ERRO: push falhou" >> "$LOG"
  exit 1
fi
