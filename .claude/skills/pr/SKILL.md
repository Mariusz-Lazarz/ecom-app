---
name: pr
description: Commit pending work, push, and open (or update) a GitHub pull request with a reviewer-focused description — summary, what changed, important files, how to test, and real proof (test counts, screenshots, API results). Use when the user says "pr", "make a PR", "open a pull request", or "commit and push" at the end of a piece of work.
---

# /pr — ship the current branch as a pull request

A PR is the final, reviewer-facing summary of a piece of work. Commits are working steps; the PR describes the **end result**. Do the whole flow without asking for confirmation.

## 1. Commit and push

- The user creates the feature branch by hand before running this skill. Use the current branch as is; don't create, switch or rename branches. If the current branch is `dev` or the repo's default branch, stop before committing anything and ask the user to create the branch.
- If there are uncommitted changes, commit them by following the `/commit` skill (`.claude/skills/commit/SKILL.md`): small Conventional Commits, files staged by name, no secrets or build output.
- Rebase onto the branch this one was cut from: `git fetch origin && git rebase origin/<parent>`. It's usually `dev`; otherwise find it with `git reflog show <branch>` ("Created from …") or by comparing `git merge-base` with the candidate branches. On conflicts, stop and ask the user.
- Apart from that rebase, never rewrite commits (no squash or amend).
- `git push -u origin HEAD`. If the rebase rewrote already-pushed commits, use `--force-with-lease`.

## 2. Understand the change

Base is the parent branch from step 1, usually `dev` (PRs never target `main`). Only if `origin/dev` doesn't exist, fall back to the default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.

- `git log --oneline <base>..HEAD` shows the steps taken.
- `git diff <base>...HEAD --stat` then the full diff show what actually changed.

Describe the **net result** of the diff, not the commit history. Classify what the change touches (frontend, backend/API, config, tests, docs). That decides which proof to collect and which mode to use:

- **Light mode**: the diff touches no runtime code, e.g. only docs (`*.md`, `CLAUDE.md`, `AGENTS.md`), comments, skills/agent config, CI or editor config. Also a tiny, self-evident code change (a typo, a one-line copy fix). Use the light template in step 4 and skip step 3 except for anything that actually applies (e.g. `npm run lint` after a config change).
- **Full mode**: everything else, meaning any change to app behavior, `src/`, `db/`, dependencies or build config.

Pick the mode yourself; don't ask. When in doubt, use full mode.

## 3. Collect proof

Everything in Proof must come from something you actually ran in this session. Never invent output. What couldn't be checked goes in **Not verified**. Don't run checks that can't say anything about this change just to fill the section.

**Tests.** Run the test scripts that exist in `package.json` and are relevant (`npm test`; `npm run test:e2e` when UI or routing changed; `npm run lint`). Report only counts. Paste output only for failures: the first failure, ≤15 lines. If anything fails, still open the PR, but as a draft (`--draft`), and say so in Summary.

**Screenshots** (when the change is visible in the UI). Take as many as needed, but only of screens that changed or that prove the feature works. No "home page for context" shots.
1. Use a running dev server if `curl -sf localhost:3000` answers. Otherwise start `npm run dev` in the background and stop it when done.
2. Write a throwaway Playwright script in your scratchpad (not in the repo) and run it from the project root so `@playwright/test` resolves:
   ```js
   import { createRequire } from "node:module"
   const { chromium } = createRequire(`${process.cwd()}/`)("@playwright/test")
   const browser = await chromium.launch()
   const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
   await page.goto("http://localhost:3000/some-page")
   // interact to reach the state worth showing, e.g. await page.getByRole("button", { name: "Add" }).click()
   await page.screenshot({ path: "<scratchpad>/descriptive-name.png" })
   await browser.close()
   ```
   Crop to the relevant area (`locator.screenshot()`) when a full page would bury the change. Add a mobile shot (`devices["Pixel 7"]`) only if the change is responsive-specific.
3. Look at every screenshot (Read it) before using it. A blank page, error overlay or wrong state is not proof.
4. Upload them:
   ```bash
   .claude/skills/pr/scripts/upload-screenshots.sh "<branch-name>" <scratchpad>/*.png
   ```
   It pushes the files to the orphan `pr-assets` branch (never merged, keeps code history clean) and prints one URL per file, in order. Use these URLs exactly.

**Diagram** (only if the diff contains one). Never create diagrams yourself; they are part of the code and are written by whoever authors the change. If the diff adds or changes a diagram file (e.g. `.svg`), it's already pushed with the branch, so embed it straight from the repo: `https://github.com/<owner>/<repo>/blob/<head-sha>/<path>?raw=true`. Use the pushed commit SHA, not the branch name, so the link survives branch deletion. Otherwise leave the Diagram section out.

**API** (when endpoints were added or changed). Hit the real server with `curl`. One row per scenario that exercises the change: the happy path plus the meaningful failures (400/401/404, validation, security checks like ignored client-supplied prices). Don't log every call made during development. Never include server logs, headers, cookies, tokens or secrets.

## 4. Write the description

Write the body in **English** to a file in your scratchpad.

**Light mode** uses this short template instead of the full one:

````markdown
## Summary

1–3 sentences: what changed and why.

## What changed

- Short bullets, one per meaningful change.

## Verification

One line, e.g. "Docs only, no runtime impact." or "✅ Lint passed."
````

**Full mode** uses the template below. Omit a section only when it truly doesn't apply (e.g. no API section for a UI-only change). Diagram, Screenshots and API are optional.

````markdown
## Summary

A short paragraph: what this PR does and **why**, in plain language. Mention the previous state if it helps ("Until now X did nothing…").

## What changed

Explain the change clearly and completely, as behavior, not as a file list. Group under **Backend** / **Frontend** / etc. when more than one area changed. Include the reasoning behind non-obvious decisions and any known limitations. No length limit, but every line must help a reviewer understand the change.

## Diagram

Only for a diagram from the diff. One line saying what it shows, then the file embedded from the repo:
![Request flow for the cart API](url)

## Important files

| File | Why look |
|---|---|
| `path/to/file.ts` | What's in it and what to pay attention to |

Only files a reviewer should actually open: core logic, tricky parts, known limitations. Skip lockfiles, generated files, trivial renames and tests that mirror the code. No length limit, but no filler.

## How to test

Check out the branch, then run `<install and start commands>`.

| # | Step | Expected |
|---|---|---|
| 1 | Concrete action with the exact URL / command | Concrete, checkable result |

Written for a reviewer running the branch locally. Browser steps use exact URLs and element names; API steps are copy-pasteable `curl`. End with the relevant test commands.

## Proof

**Tests:** ✅ Unit: N passed · ✅ E2E: N passed (mention new tests briefly)

**Screenshots**

One-line caption saying what the screenshot proves:
![alt text](url)

**API**

| Request | Status | Result |
|---|---|---|
| `POST /api/x` `{ key: "value" }` | 201 | Human-readable summary of the response |

<details><summary>Request/response details</summary>

For the key scenarios: the `curl` command, then the response JSON. Trim long arrays to 1–2 items plus `// ...+N more`.
</details>

## Not verified

- Anything not checked, and why. Write "Nothing — all changes were verified above." if everything was checked.
````

Title: short and imperative, describing the end result (e.g. `Add working cart: API routes + live header counter`). No Conventional Commit prefix (`feat:`): commits carry those, the PR title reads as plain English.

## 5. Open or update the PR

- If `gh pr view --json url` finds a PR for this branch, update it: `gh pr edit --title "<title>" --body-file <file>`.
- Otherwise: `gh pr create --base <base> --title "<title>" --body-file <file>` (add `--draft` if tests failed).
- End the body with the attribution line required by the session's git/PR instructions, if any.

Reply to the user with the PR URL and a 2–3 line recap (tests result, number of screenshots/API checks, anything in Not verified). Don't repeat the whole description in chat.
