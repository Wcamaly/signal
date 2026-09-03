#!/usr/bin/env bash
# Locks the default branch on GitHub: no direct pushes, no force pushes, no
# deletion, changes land through a pull request.
#
#   bash scripts/protect-main.sh                 # uses the origin remote
#   REPO=owner/name BRANCH=main bash scripts/protect-main.sh
#
# Needs the gh CLI authenticated with an account that has admin rights on the
# repository. The local pre-push hook (.githooks/pre-push) covers this machine;
# this script covers everyone else.

set -euo pipefail

command -v gh >/dev/null || { echo "gh CLI not found: https://cli.github.com" >&2; exit 1; }

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
BRANCH="${BRANCH:-$(gh repo view "$REPO" --json defaultBranchRef --jq .defaultBranchRef.name)}"
REVIEWERS="${REVIEWERS:-0}"   # required approvals; 0 works for a solo maintainer

echo "Protecting ${REPO}@${BRANCH} (required approvals: ${REVIEWERS})…"

gh api -X POST "repos/${REPO}/rulesets" --input - <<JSON
{
  "name": "protect-${BRANCH}",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/${BRANCH}"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": ${REVIEWERS},
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    }
  ]
}
JSON

echo "Done. Verify with:  gh api repos/${REPO}/rulesets --jq '.[].name'"
