---
name: refactor-task
description: Orchestration workflow for one task of the v2 refactor. Use when starting, delegating, verifying, or handing off a task from REFACTOR_PLAN.md.
---

The main session is the orchestrator. Subagents (`db-specialist`, `app-specialist`, `reviewer`) cannot spawn other subagents. Keep everything token-lean: read only what the task needs.

## 1. Establish context
- Read the relevant task row and nearby sections of REFACTOR_PLAN.md, not the whole repo.
- Run `git status` and a targeted `git diff --stat`. Uncommitted changes are the user's; preserve them and never stash, reset, clean, or revert.
- Confirm prerequisites (dependencies in the plan, Docker running if DB checks are needed).

## 2. Write a task brief (keep it short)
Objective · scope · files/components · dependencies · constraints · acceptance criteria · required checks · explicit exclusions.

## 3. Choose a strategy
- Do trivial edits yourself; delegate only work that benefits from a specialist or isolation.
- Order is database first: contract → approval → migration and tests → `pnpm db:types` → web/iOS → review. Do not run dependent tasks in parallel.
- Parallel only for independent read-only audits and reviews. Agents share one working tree, so never let two agents edit the same file, migration, or shared type. Do not introduce worktrees without need.
- Never start two agents on the same problem.

## 4. Delegate
- Pass the brief and file paths, not the conversation. Ask for the short report format defined in the agent file.
- Do not assume Supabase or Cloudflare MCP tools reach subagents. If remote state is needed, query it yourself, read-only.

## 5. Verify (do not trust the summary)
- Read the real diff of the changed files. Check scope, correctness, DB compatibility, security, unintended changes.
- Run the smallest meaningful check yourself. Report each as passed, failed, skipped, or not run (with reason). Build or unit tests do not prove RLS or runtime behavior.
- Use `reviewer` after larger or security-sensitive changes.

## 6. Update the plan
Update REFACTOR_PLAN.md concisely (status, new risks, results actually obtained). Use VERIFIED, IMPLEMENTED, TESTED, PROPOSED, UNVERIFIED, BLOCKED, DEFERRED. Phase results go to `docs/v2-status.md`. Do not add new files to `docs/`.

## 7. Hand off
Return: what changed · what was verified · what remains · blockers · the single best next action. Do not start an unrelated task.

## Stop and ask first
Remote DB writes or migrations, production policy/secret/auth changes, deploys, Cloudflare production changes, deleting data, commits or pushes, destructive git, new MCPs/plugins/dependencies, and anything outside the approved plan.
