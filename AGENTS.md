# Repo Guidance

- Do not run `npm install`, `npm ci`, `pnpm install`, `yarn install`, or any command that creates `node_modules` unless the user explicitly asks for dependency installation.
- Prefer static analysis, file inspection, and targeted code edits over installing packages for this project.
- If a task would benefit from installed dependencies, explain why and wait for explicit approval before proceeding.
