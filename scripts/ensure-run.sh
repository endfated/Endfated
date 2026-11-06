#!/usr/bin/env bash
# Start check.yml unless a run with one of the given statuses already exists.
#   ensure-run.sh pending queued              -> make sure a successor waits in the queue
#   ensure-run.sh in_progress pending queued  -> watchdog: restart the chain if nothing runs
# Retries GitHub API hiccups (e.g. HTTP 502) and never fails the caller.
set -u
api="repos/$GITHUB_REPOSITORY/actions/workflows/check.yml"
for try in 1 2 3 4 5; do
  found=0 ok=1
  for st in "$@"; do
    n=$(gh api "$api/runs?status=$st&per_page=1" --jq .total_count 2>/dev/null) || { ok=0; break; }
    found=$((found + n))
  done
  if [ $ok = 1 ]; then
    [ $found -gt 0 ] && exit 0
    gh workflow run check.yml --repo "$GITHUB_REPOSITORY" --ref master && { echo "check run queued"; exit 0; }
  fi
  sleep $((try * 10))
done
echo "::warning::could not queue a check run, retrying later"
