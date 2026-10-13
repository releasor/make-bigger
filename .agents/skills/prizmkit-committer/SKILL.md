---
name: prizmkit-committer
description: "Pure git commit workflow with safety checks. Stages files, generates Conventional Commits message, and commits. Does NOT modify .prizmkit/prizm-docs/ — run /prizmkit-retrospective first. Trigger on: 'commit', 'submit', 'finish', 'done', 'ship it'. (project)"
---
> Codex project install: when instructions mention a PrizmKit slash command such as `/prizmkit-plan`, read and execute the matching project skill at `.agents/skills/prizmkit-plan/SKILL.md`.
>
> Codex interaction compatibility: when this skill or any referenced PrizmKit file says `AskUserQuestion`, use Codex `request_user_input` if it is available. If the current Codex surface does not expose `request_user_input`, including Default mode, ask the same question directly in chat and wait for explicit user input. Tool unavailability is not permission to choose defaults. If a source instruction asks more questions than Codex allows in one call, split them into multiple calls while preserving order. Only true headless/non-interactive runs, such as `codex exec` automation with no conversational user available, may skip interaction and choose documented defaults; never silently choose defaults in an interactive session.


# PrizmKit Committer

### When to Use
- User says "commit", "submit", "finish", "done with this task", "ship it"
- After `/prizmkit-retrospective` has finished architecture sync
- The UserPromptSubmit hook will remind to use this skill when commit intent is detected

**PRECONDITION:**

| Required State | Check | If Missing |
|---|---|---|
| Uncommitted changes exist | `git status` shows modified/added/untracked files | Inform user "nothing to commit" and stop |
| `.prizmkit/prizm-docs/` synced (feature/refactor) | `/prizmkit-retrospective` has run | Run `/prizmkit-retrospective` first |
| Code review passed (pipeline mode) | `review-report.md` in artifact directory has `## Verdict: PASS` | Run `/prizmkit-code-review` first |

### Workflow

Follow these steps in order — skipping or reordering can stage sensitive files or commit without proper verification:

#### Step 1: Status Check
```bash
git status
```
- If "nothing to commit, working tree clean": inform user and stop
- If there are changes: proceed

#### Step 2: Generate Commit Message
Analyze the staged diff and context (spec title, plan summary) to generate a concise Conventional Commits message. The message should capture the *what* and *why* of the change.

#### Step 3: Update CHANGELOG.md
If CHANGELOG.md exists in the project root, append an entry following Keep a Changelog format under the `[Unreleased]` section. Match the existing style in the file.

#### Step 4: Git Commit

Stage changes using a safe strategy — **never use `git add .` or `git add -A`** as they may stage sensitive files (.env, credentials, secrets) or unintended changes:

1. Review untracked files with `git status`. Warn the user if any files match sensitive patterns (`.env*`, `*credential*`, `*secret*`, `*.pem`, `*.key`).
2. Stage tracked modified files: `git add -u`
3. For new files: stage explicitly by name after confirming they should be included.
4. Verify staged content with `git diff --cached --stat` before committing.

```bash
git commit -m "<type>(<scope>): <description>"
```
Follow Conventional Commits format.

#### Step 5: Verification
```bash
git log -1 --stat
```
Confirm the commit was recorded.

Then verify working tree is clean:
```bash
git status
```
- If "nothing to commit, working tree clean": commit verified successfully, proceed

#### Step 6: Optional Push
Ask user: "Push to remote?"
- Yes: `git push`
- No: Stop

**Headless mode**: If the skill was invoked with `--headless` in the args (e.g., `/prizmkit-committer --headless feat(F-001): ...`), **SKIP this step entirely**. Do NOT ask the question. Do NOT push. Stop after Step 5 verification. Headless mode is used by autonomous pipeline sessions where there is no human to answer interactive prompts.

## Example

**Feature commit:**
```
git commit -m "feat(avatar): add user avatar upload with S3 storage"
```

**Bug fix commit:**
```
git commit -m "fix(auth): handle null token in refresh flow"
```
