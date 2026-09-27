#!/usr/bin/env bash
# Upload screenshots to the orphan `pr-assets` branch and print a raw URL per file.
# Usage: upload-screenshots.sh <folder> <file>...
# URLs are pinned to the commit SHA, so re-uploading a file never shows a cached old version.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <folder> <file>..." >&2
  exit 1
fi

folder=$1
shift
for f in "$@"; do
  [ -f "$f" ] || { echo "not a file: $f" >&2; exit 1; }
done

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
tmp_branch="pr-assets-tmp-$$"

cleanup() {
  git -C "$root" worktree remove --force "$tmp" >/dev/null 2>&1 || rm -rf "$tmp"
  git -C "$root" branch -D "$tmp_branch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Run a git command quietly; print its output only if it fails.
# Keeps credential-helper warnings and GitHub's "Create a pull request" hint out of the output.
quiet() {
  local out
  if ! out=$("$@" 2>&1); then
    echo "$out" >&2
    return 1
  fi
}

if git -C "$root" ls-remote --exit-code --heads origin pr-assets >/dev/null 2>&1; then
  quiet git -C "$root" fetch -q origin pr-assets
  git -C "$root" worktree add -q --detach "$tmp" FETCH_HEAD
else
  # First upload: start an empty history that shares nothing with the code branches.
  git -C "$root" worktree add -q --detach "$tmp"
  git -C "$tmp" checkout -q --orphan "$tmp_branch"
  git -C "$tmp" rm -rfq .
fi

mkdir -p "$tmp/$folder"
cp "$@" "$tmp/$folder/"
git -C "$tmp" add "$folder"
git -C "$tmp" commit -qm "Screenshots for $folder"
quiet git -C "$tmp" push -q origin HEAD:refs/heads/pr-assets
sha=$(git -C "$tmp" rev-parse HEAD)

for f in "$@"; do
  echo "https://raw.githubusercontent.com/$repo/$sha/$folder/$(basename "$f")"
done
