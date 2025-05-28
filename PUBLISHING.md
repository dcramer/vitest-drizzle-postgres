# Publishing Guide

This project uses Changesets with Turborepo for version management and publishing.

## Quick Start

```bash
# 1. Create changeset for your changes
pnpm changeset

# 2. Version packages
pnpm changeset:version

# 3. Publish
pnpm changeset:publish
```

## Detailed Workflow

### Create Changeset

```bash
pnpm changeset
```

Select packages, change type (patch/minor/major), and add summary.

### Version Packages

```bash
pnpm changeset:version
```

Updates package.json versions and generates CHANGELOG.md files.

### Publish

```bash
pnpm changeset:publish
```

Builds and publishes changed packages to npm.

## Change Types

- **patch**: Bug fixes (0.0.1 → 0.0.2)
- **minor**: New features (0.0.1 → 0.1.0)
- **major**: Breaking changes (0.0.1 → 1.0.0)

## Complete Example

```bash
# Make changes and create changeset
git checkout -b feature/new-feature
# ... make changes ...
pnpm changeset

# Commit and merge
git add .changeset/
git commit -m "Add changeset for new feature"
git checkout main
git merge feature/new-feature

# Version and publish
pnpm changeset:version
git add .
git commit -m "Version packages"
pnpm changeset:publish
git push --follow-tags
```

## CI/CD Setup

```yaml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm test:all
      - run: pnpm lint
      
      - name: Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset:publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
``` 
