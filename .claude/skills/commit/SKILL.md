---
name: commit
description: Commit pending work as small, logical Conventional Commits (type(scope): subject), splitting unrelated changes into separate commits and linting changed files first. Doesn't push. Use when the user says "commit", "commit this", "make commits" or "zacommituj", and whenever another skill (e.g. /pr) needs to commit changes.
---

# /commit — turn pending work into clean commits

Commits are working steps a reviewer reads one by one, and they reach `dev` and `main` unchanged (PRs are merged with a merge commit, not squashed). Each one should be small, focused and explain itself. Do the whole flow without asking for confirmation.

## 1. Check the branch

Use the current branch as is. If it is `dev` or the repo's default branch, stop before committing anything and ask the user to create a feature branch (`feature/<short-name>`, `fix/<short-name>`).

## 2. Look at the changes

Note the current commit (`git rev-parse HEAD`) for the recap. Run `git status`, `git diff --cached`, `git diff` and read new untracked files.

- **Something is already staged**: the user chose what goes in. Commit only the staged changes (split them per step 3 if they mix concerns) and leave the rest untouched.
- **Nothing is staged**: take all pending changes.
- **Nothing to commit**: say so and stop.

Never commit secrets (`.env*` except `.env.example`, keys, tokens) or build output (`.next/`, `node_modules/`, `test-results/`, `playwright-report/`). If one of these shows up as untracked, leave it out and mention it.

## 3. Split into logical commits

- One commit = one reason to change. If the subject needs "and", it's probably two commits.
- Group by purpose, not by file type. A test goes with the code it tests, a migration with the code that uses it, a new component with the page that renders it.
- Each commit should leave the project in a working state (builds, tests pass), so `git bisect` and `git revert` stay useful.
- Order by dependency: DB/migrations and `src/lib` first, then API/actions, then UI, then docs that describe the result.
- Don't over-split. A small fix plus its test is one commit; a rename touching ten files is one commit.
- Split at file level. Interactive staging (`git add -p`) isn't available; when a single file mixes two concerns, commit it with the concern it mostly belongs to and mention that in the recap.

## 4. Lint changed files

Before committing, run ESLint only on the changed JS/TS files (`*.ts`, `*.tsx`, `*.js`, `*.mjs`) that still exist:

```bash
npx eslint <files>
```

Skip this step when no such file changed. Fix errors the change introduced, then continue; warnings don't block. If an error isn't obviously fixable, stop and report it instead of committing. Full typecheck and tests belong to `/pr`, not here.

## 5. Write the messages

Format ([Conventional Commits](https://www.conventionalcommits.org/)), in English:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type**: what kind of change it is.

| Type | Use for |
|---|---|
| `feat` | New user-facing behavior or API |
| `fix` | A bug fix |
| `refactor` | Code change with no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests only |
| `docs` | Docs, comments, `CLAUDE.md`, skills |
| `style` | Formatting only |
| `build` | Dependencies, build or bundler config |
| `ci` | GitHub Actions |
| `chore` | Anything else that doesn't touch `src/` or tests |

**Scope**: the area touched, lowercase, e.g. `auth`, `db`, `api`, `ui`, `cart`, `categories`, `payments`, `logger`, `errors`, `skills`. Omit it when the change is cross-cutting.

**Subject**: imperative mood ("add", not "added"/"adds"), lowercase after the colon, no trailing period, ≤72 characters (aim for ~50). Describe the effect, not the file: `fix(auth): reject login for unknown email`, not `fix: update login.ts`.

**Body**: optional. Add it only when the diff doesn't explain itself: why the change was needed, a trade-off, a known limitation. Wrap at 72 characters. Don't list files or restate the subject.

**Footer**:
- Breaking change: add `!` after the type/scope (`feat(api)!: …`) and a `BREAKING CHANGE: <what breaks and how to migrate>` footer.
- End with the attribution trailer required by the session's git instructions, if any.

Pass the message with a heredoc so line breaks survive:

```bash
git commit -F - <<'EOF'
feat(cart): add quantity stepper to cart items

EOF
```

## 6. Commit

For each planned commit: `git add <files by name>` (never `git add -A` or `git add .`), then `git commit`.

- Never `--amend`, rebase, squash or `--no-verify`. If a hook rejects a commit, fix the problem and create the commit again.
- Don't push; `/pr` does that.

Reply with the new commits (`git log --oneline <noted commit>..HEAD`) and anything left uncommitted or committed as a compromise (mixed-concern file, skipped secret). Keep it to a few lines.
