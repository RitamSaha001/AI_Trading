# Repository Guidelines & Operational Invariants

## Git Commit & Deployment Standards
1. **Pre-Commit Verification**: Before committing, always run:
   - `npm run lint` (`tsc --noEmit`)
   - `npm test` (`vitest run`)
   - `npm run build` (`vite build`)
2. **Audit All Changes**: Always check `git status -uall` to ensure no newly created files, scripts, or tests are left untracked.
3. **Semantic Commits**: Use conventional commits (`feat(...)`, `fix(...)`, `test(...)`, `chore(...)`).
4. **Post-Push Verification**: After pushing to `origin/main` or deployment branches:
   - Check the status of triggered GitHub Actions workflow runs via GitHub API or CLI.
   - If a workflow fails, inspect the failing step immediately and resolve the root cause.
   - Verify the deployment environment (e.g., GitHub Pages) is active with the new commit SHA.
