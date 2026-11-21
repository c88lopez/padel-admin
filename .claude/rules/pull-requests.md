# Pull requests

- Assign new PRs to the repo owner: `gh pr create --assignee @me`.
- PRs are merged manually (squash), after required checks pass. Merging deploys it to the cluster (release, then Argo CD); label the PR `release:minor` for a minor version. Nothing auto-merges; the head branch is deleted on merge.
- Before opening a PR, make sure `bun run typecheck`, `bun run lint`, `bun run check` (Prettier) and `make test` pass. CI runs all of them, and `make test` includes the integration suite that the bare `bun run test` skips.
