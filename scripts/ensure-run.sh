#!/usr/bin/env bash
# Dispatch check.yml unless a check run in one of the given states already exists.
#   ensure-run.sh queued pending waiting requested              -> successor waits in the queue
#   ensure-run.sh in_progress queued pending waiting requested  -> watchdog: restart if nothing runs
# Retries GitHub API hiccups (e.g. HTTP 502); always exits 0 so it can never stop the caller.
states=$(printf '"%s",' "$@")
for try in 1 2 3 4 5; do
  n=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/check.yml/runs?per_page=30" \
        --jq "[.workflow_runs[] | select(.status | IN(${states%,}))] | length" 2>/dev/null)
  if [[ $n =~ ^[0-9]+$ ]]; then
    [ "$n" -gt 0 ] && exit 0
    gh workflow run check.yml --repo "$GITHUB_REPOSITORY" --ref master && { echo "check run queued"; exit 0; }
  fi
  [ $try -lt 5 ] && sleep $((try * 10))
done
echo "::warning::could not queue a check run, retrying later"
exit 0
