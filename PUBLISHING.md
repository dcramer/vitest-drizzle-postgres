# Publishing Guide

This project uses [Changesets](https://github.com/changesets/changesets) with Turborepo for version management and publishing.

## Publishing Workflow

### 1. Create a Changeset

When you make changes that should be published, create a changeset:

```bash
pnpm changeset
```

This will:
- Prompt you to select which packages changed
- Ask for the type of change (patch, minor, major)
- Request a summary of the changes
- Generate a changeset file in `.changeset/`

### 2. Version Packages

When ready to release, update package versions:

```bash
pnpm changeset:version
```

This will:
- Consume all changeset files
- Update package.json versions
- Update CHANGELOG.md files
- Remove the consumed changeset files

### 3. Build and Test

Ensure everything builds and tests pass:

```bash
pnpm test:all
pnpm lint
```

### 4. Publish

Publish the packages:

```bash
pnpm changeset:publish
```

This will:
- Build all packages (via `prepublishOnly`)
- Publish changed packages to npm
- Create git tags for the releases

## Using Turbo Commands

You can also use the Turbo-coordinated commands:

```bash
# Run version across all packages
pnpm version

# Run publish across all packages  
pnpm publish
```

## Package Configuration

Each publishable package needs:

1. **Version script** in `package.json`:
   ```json
   {
     "scripts": {
       "version": "echo 'Version updated'",
       "publish": "npm publish"
     }
   }
   ```

2. **prepublishOnly script** to ensure build:
   ```json
   {
     "scripts": {
       "prepublishOnly": "pnpm build"
     }
   }
   ```

## Changeset Types

- **patch**: Bug fixes, small changes (0.0.1 → 0.0.2)
- **minor**: New features, backwards compatible (0.0.1 → 0.1.0)  
- **major**: Breaking changes (0.0.1 → 1.0.0)

## Example Workflow

```bash
# 1. Make your changes
git checkout -b feature/new-feature

# 2. Create changeset
pnpm changeset
# Select packages, change type, add summary

# 3. Commit changeset
git add .changeset/
git commit -m "Add changeset for new feature"

# 4. Merge to main
git checkout main
git merge feature/new-feature

# 5. Version and publish
pnpm changeset:version
git add .
git commit -m "Version packages"

pnpm changeset:publish
git push --follow-tags
```

## CI/CD Integration

For automated publishing, you can use GitHub Actions:

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
      
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset:publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
``` 
