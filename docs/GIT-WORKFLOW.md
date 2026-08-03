# Gold Coast Kenkey POS Git Workflow

## 1. Purpose

This workflow allows three group members to work on the same project without overwriting one another or producing incompatible code.

All work must use branches and pull requests.

## 2. Permanent Branches

### `main`

Contains only stable, reviewed, tested work.

Rules:

- No direct coding.
- No direct pushes.
- Merge only from `develop`.
- Use for final demonstrations and releases.

### `develop`

Contains integrated work for the current project version.

Rules:

- Feature branches are created from `develop`.
- Pull requests target `develop`.
- Code must be reviewed before merging.

## 3. Feature Branches

Create one branch per feature.

Naming examples:

```text
feature/project-foundation
feature/sales-interface
feature/meal-configuration
feature/cart
feature/cash-checkout
feature/receipts
feature/inventory
feature/sales-history
feature/daily-report
```

Bug-fix examples:

```text
fix/cart-total
fix/duplicate-sale
fix/mobile-layout
```

Documentation examples:

```text
docs/update-menu-rules
docs/add-testing-cases
```

## 4. Starting New Work

Always begin from the latest `develop`.

```bash
git checkout develop
git pull origin develop
git checkout -b feature/meal-configuration
```

Do not create a feature branch from an old feature branch unless specifically required.

## 5. Before Coding

1. Read the specification.
2. Read `AGENTS.md`.
3. Confirm the feature acceptance criteria.
4. Inspect existing code.
5. Identify shared functions and components.
6. Avoid changing unrelated files.

## 6. Saving Work

Check changes:

```bash
git status
```

Stage selected files:

```bash
git add path/to/file
```

Or stage all intended changes:

```bash
git add .
```

Commit:

```bash
git commit -m "feat: add Jollof portion configuration"
```

Push:

```bash
git push -u origin feature/meal-configuration
```

## 7. Commit Message Format

Use:

```text
type: short description
```

Approved types:

```text
feat
fix
docs
test
refactor
style
chore
```

Examples:

```text
feat: add configurable meal extras
fix: prevent checkout below total
docs: add inventory rules
test: add cart total test cases
refactor: centralize money rounding
style: improve mobile cart spacing
chore: update ignore rules
```

Avoid unclear messages:

```text
update
changes
work
final
fix stuff
```

## 8. Pull Requests

Open a pull request from the feature branch into `develop`.

A pull request must contain:

- Feature summary.
- Related specification.
- Files changed.
- Testing performed.
- Screenshots for UI work.
- Known limitations.

Use the repository pull-request template.

## 9. Review Rules

The reviewer must check:

- Correctness.
- Specification compliance.
- Shared architecture.
- UI consistency.
- Validation.
- Testing.
- Unrelated changes.
- Console errors.
- Duplicated logic.

Do not approve only because the screen looks good.

## 10. Updating a Feature Branch

Before final review, update the feature branch with the latest `develop`.

```bash
git checkout develop
git pull origin develop
git checkout feature/meal-configuration
git merge develop
```

Resolve conflicts carefully.

Alternative using rebase may be used only if the team understands it.

## 11. Conflict Resolution

When a conflict occurs:

1. Do not delete conflict markers blindly.
2. Understand both versions.
3. Keep correct work from both branches.
4. Run the project.
5. Test affected features.
6. Ask the original author when uncertain.
7. Commit the conflict resolution.

Never use commands that discard work without understanding the effect.

## 12. Merging

Preferred merge method:

```text
Squash and merge
```

This keeps the `develop` history understandable.

The pull-request title should become the final commit message.

Example:

```text
feat: add configurable meal portion workflow
```

## 13. Moving from `develop` to `main`

When a milestone is stable:

1. Test all major workflows.
2. Confirm there are no critical errors.
3. Open a pull request from `develop` into `main`.
4. Review the complete milestone.
5. Merge after approval.
6. Add a version tag where practical.

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 14. Branch Protection

Protect `main`.

Recommended settings:

- Require a pull request before merging.
- Require at least one approval.
- Require resolved conversations.
- Block force pushes.
- Block branch deletion.
- Require the branch to be up to date.
- Restrict direct pushes.

Protect `develop` where practical.

## 15. CODEOWNERS

The repository uses `.github/CODEOWNERS`.

The owner listed there should review all pull requests.

## 16. Files That Must Not Be Committed

Do not commit:

```text
node_modules/
dist/
build/
.env
.env.*
*.log
.DS_Store
Thumbs.db
.vscode/
.idea/
```

A safe example environment file may be committed as:

```text
.env.example
```

Do not place real secrets inside it.

## 17. AI-Generated Code Rules

When AI generates code:

1. The member must review every changed file.
2. The member must run the project.
3. The member must test the feature.
4. The member must remove unrelated changes.
5. The member must understand the code.
6. The pull request must disclose major generated changes honestly if required by the school.
7. AI must not directly decide project architecture outside the documented rules.

## 18. Recommended Team Process

### Before each feature

- Agree on acceptance criteria.
- Assign one owner.
- Create one issue.
- Create one branch.

### During development

- Commit small changes.
- Push regularly.
- Communicate file ownership.
- Avoid editing the same file unnecessarily.

### Before merge

- Update from `develop`.
- Test.
- Open pull request.
- Review together.
- Merge only when correct.

## 19. Emergency Recovery Commands

View current state:

```bash
git status
git branch --show-current
git log --oneline --decorate -10
```

Temporarily save unfinished work:

```bash
git stash push -m "unfinished meal configuration"
```

Restore it:

```bash
git stash list
git stash pop
```

Do not use destructive commands such as `git reset --hard` unless the team understands exactly what will be lost.
