---
name: git-update-and-deploy
description: >-
  Standard operating procedure for auditing, testing, committing, pushing,
  and verifying deployments on GitHub and GitHub Pages. Use whenever committing changes
  or deploying the AI Trading repository.
---

# Git Update & Deployment Runbook

## Procedure

1. **Audit Working Tree**:
   - Run `git status -uall` and `git diff` to review all staged, unstaged, and untracked files.
   - Ensure all necessary files are included and no temporary artifacts are committed.

2. **Execute Quality Gates**:
   - Run `npm run lint`
   - Run `npm test`
   - Run `npm run build`
   - Confirm 0 errors before proceeding.

3. **Stage and Commit**:
   - Stage target files explicitly: `git add <files>`
   - Commit with descriptive summary: `git commit -m "<type>(<scope>): <summary>"`

4. **Push to Remote**:
   - Push to active tracking branch: `git push origin <branch>`

5. **Verify GitHub Actions & Pages Deployment**:
   - Query GitHub Actions workflow runs:
     `curl -s "https://api.github.com/repos/RitamSaha001/AI_Trading/actions/runs?per_page=3"`
   - Confirm status is `completed` and conclusion is `success`.
   - Verify the deployment endpoint returns the latest asset hashes.
