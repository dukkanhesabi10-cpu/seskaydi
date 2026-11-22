#!/usr/bin/env bash
# herdr ile 3 rollü agent hattı: implementer → reviewer, yanında test watcher.
# Gereksinim: herdr, jq, git; claude ve codex CLI'ları kurulu ve oturum açılmış olmalı.
# Kullanım:  ./orchestrate.sh ~/proje "Görev açıklaması"
set -euo pipefail

REPO=${1:?repo yolu}
TASK=${2:?görev metni}
BRANCH="agent/$(date +%Y%m%d-%H%M%S)"
T=600000   # 10 dk (ms)

j() { jq -r "$1"; }

# 1) İzole worktree + workspace (root pane döner)
ws=$(herdr worktree create --cwd "$REPO" --branch "$BRANCH" --label impl --no-focus)
impl_pane=$(j '.result.root_pane.pane_id' <<<"$ws")

# 2) Layout: sağda reviewer, altta test watcher
rev_pane=$(herdr pane split "$impl_pane" --direction right --no-focus | j '.result.pane.pane_id')
test_pane=$(herdr pane split "$impl_pane" --direction down --no-focus | j '.result.pane.pane_id')

# 3) Agent'ları başlat (start, agent hazır olunca döner)
herdr agent start impl     --kind claude --pane "$impl_pane"
herdr agent start reviewer --kind codex  --pane "$rev_pane"

# 4) Test watcher: sıradan süreç, pane komutlarıyla yönetilir
herdr pane run "$test_pane" "make test-watch"

# 5) Implementer'a görevi ver, bitene ya da takılana kadar bekle
herdr pane report-metadata "$impl_pane" --source orchestrate --token summary="implementing"
state=$(herdr agent prompt impl "$TASK" --wait --timeout $T | j '.result.agent.agent_status // .result.agent.status // empty')

if [[ "$state" == "blocked" ]]; then
  echo ">> impl onay bekliyor; son çıktı:"
  herdr agent read impl --source recent-unwrapped --lines 40
  exit 2   # karar insanın; otomatik onaylamıyoruz
fi

# 6) Testlerin sonucunu bekle
herdr pane wait-output "$test_pane" --regex "passed|failed" --timeout $T >/dev/null

# 7) Reviewer'a diff'i incelet, çıktıyı topla
herdr pane report-metadata "$impl_pane" --source orchestrate --token summary="in review"
herdr agent prompt reviewer \
  "Review the diff of branch $BRANCH against main. Write findings to /tmp/review-$BRANCH.md and reply only with that path." \
  --wait --timeout $T >/dev/null
herdr agent read reviewer --source recent-unwrapped --lines 20

echo ">> Bitti. Branch: $BRANCH"
