---
name: ai-test-skill
description: Test the forge CLI skills manifest feature (--ai and --ai-skills options). Use when you need to verify skill installation works correctly for new projects.
allowed-tools: Bash(pnpm:*), Bash(forge:*), Bash(ls:*), Bash(cat:*), Bash(rm:*), Bash(mkdir:*), Read, Write, Grep
---

# AI Skills Manifest Testing

Test the `--ai` and `--ai-skills` options for `forge new` to verify skills are correctly installed from the manifest.

## Setup

First, choose whether to test with a local development branch or the installed `forge` CLI:

### Option A: Local Development Branch (default path: ~/dev/thickideas/forge)

```bash
# Set the forge command to use local dev version
export FORGE_CMD="pnpm --dir ~/dev/thickideas/forge run forge"

# Or if using a different path:
export FORGE_CMD="pnpm --dir /path/to/forge run forge"
```

### Option B: Installed forge CLI

```bash
export FORGE_CMD="forge"
```

## Test Directory Setup

```bash
# Create a temporary test directory
export TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
echo "Testing in: $TEST_DIR"
```

## Test 1: Default Skills Manifest (--ai flag behavior via `new`)

This test verifies that `forge new` installs all skills from the built-in `assets/skills.json` manifest.

### Expected Skills from Manifest

Local skills (always installed):
- typecheck
- test
- git-pr
- code-review
- commit-helper
- agent-browser

Conditional local skills:
- db-migrate (only when --db is used)

Remote skills (always installed):
- vercel-react-best-practices (from vercel-labs/agent-skills)
- web-design-guidelines (from vercel-labs/agent-skills)

Conditional remote skills:
- better-auth-best-practices (only when auth is betterauth/simple)

### Run Test

```bash
# Create a test project (minimal, no external services)
$FORGE_CMD new test-ai-default --ci

# Verify local skills were installed
echo "=== Checking local skills ==="
for skill in typecheck test git-pr code-review commit-helper agent-browser; do
  if [ -d "test-ai-default/.claude/skills/$skill" ]; then
    echo "✓ $skill installed"
  else
    echo "✗ $skill MISSING"
  fi
done

# db-migrate should NOT be installed (no --db flag)
if [ -d "test-ai-default/.claude/skills/db-migrate" ]; then
  echo "✗ db-migrate should NOT be installed without --db"
else
  echo "✓ db-migrate correctly skipped (no --db)"
fi

# Check for remote skills (may fail if network unavailable)
echo "=== Checking remote skills ==="
for skill in vercel-react-best-practices web-design-guidelines; do
  if [ -d "test-ai-default/.claude/skills/$skill" ]; then
    echo "✓ $skill installed"
  else
    echo "⚠ $skill not found (network may be unavailable)"
  fi
done
```

### Test with --db flag

```bash
# Create project with database to test conditional skill
$FORGE_CMD new test-ai-with-db --db postgres --ci

# db-migrate SHOULD be installed
if [ -d "test-ai-with-db/.claude/skills/db-migrate" ]; then
  echo "✓ db-migrate installed with --db"
else
  echo "✗ db-migrate MISSING (should be installed with --db)"
fi
```

## Test 2: Custom Skills Manifest (--ai-skills option)

This test verifies that `--ai-skills <path>` overrides the default manifest with a custom one.

### Create Custom Test Manifest

```bash
# Create a minimal test manifest with only 2 skills
cat > "$TEST_DIR/test-skills.json" << 'EOF'
{
  "skills": [
    {
      "id": "typecheck",
      "source": "local",
      "asset": "claude/skills/typecheck",
      "always": true
    },
    {
      "id": "test",
      "source": "local",
      "asset": "claude/skills/test",
      "always": true
    }
  ]
}
EOF

echo "Created custom manifest at: $TEST_DIR/test-skills.json"
cat "$TEST_DIR/test-skills.json"
```

### Run Test with Custom Manifest

```bash
# Create project using custom manifest
$FORGE_CMD new test-ai-custom --ai-skills "$TEST_DIR/test-skills.json" --ci

# Only typecheck and test should be installed
echo "=== Checking custom manifest skills ==="

# These SHOULD be installed
for skill in typecheck test; do
  if [ -d "test-ai-custom/.claude/skills/$skill" ]; then
    echo "✓ $skill installed"
  else
    echo "✗ $skill MISSING"
  fi
done

# These should NOT be installed (not in custom manifest)
for skill in git-pr code-review commit-helper agent-browser db-migrate; do
  if [ -d "test-ai-custom/.claude/skills/$skill" ]; then
    echo "✗ $skill should NOT be installed (not in custom manifest)"
  else
    echo "✓ $skill correctly skipped"
  fi
done
```

## Cleanup

```bash
# Remove test projects
rm -rf "$TEST_DIR"
echo "Cleaned up test directory"
```

## Quick All-in-One Test Script

Run this complete test script:

```bash
#!/bin/bash
set -e

# Configuration - edit this line to switch between local and installed forge
FORGE_CMD="${FORGE_CMD:-pnpm --dir ~/dev/thickideas/forge run forge}"

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
echo "Testing in: $TEST_DIR"
echo "Using command: $FORGE_CMD"
echo ""

PASS=0
FAIL=0

check() {
  local name="$1"
  local condition="$2"
  if eval "$condition"; then
    echo "✓ $name"
    ((PASS++))
  else
    echo "✗ $name"
    ((FAIL++))
  fi
}

# Test 1: Default manifest
echo "=== Test 1: Default Skills Manifest ==="
$FORGE_CMD new test-default --ci 2>/dev/null

check "typecheck installed" "[ -d test-default/.claude/skills/typecheck ]"
check "test installed" "[ -d test-default/.claude/skills/test ]"
check "git-pr installed" "[ -d test-default/.claude/skills/git-pr ]"
check "code-review installed" "[ -d test-default/.claude/skills/code-review ]"
check "commit-helper installed" "[ -d test-default/.claude/skills/commit-helper ]"
check "agent-browser installed" "[ -d test-default/.claude/skills/agent-browser ]"
check "db-migrate skipped (no --db)" "[ ! -d test-default/.claude/skills/db-migrate ]"

echo ""

# Test 2: Custom manifest
echo "=== Test 2: Custom Skills Manifest ==="
cat > "$TEST_DIR/custom.json" << 'EOF'
{
  "skills": [
    { "id": "typecheck", "source": "local", "asset": "claude/skills/typecheck", "always": true },
    { "id": "test", "source": "local", "asset": "claude/skills/test", "always": true }
  ]
}
EOF

$FORGE_CMD new test-custom --ai-skills "$TEST_DIR/custom.json" --ci 2>/dev/null

check "typecheck installed (custom)" "[ -d test-custom/.claude/skills/typecheck ]"
check "test installed (custom)" "[ -d test-custom/.claude/skills/test ]"
check "git-pr skipped (custom)" "[ ! -d test-custom/.claude/skills/git-pr ]"
check "code-review skipped (custom)" "[ ! -d test-custom/.claude/skills/code-review ]"
check "commit-helper skipped (custom)" "[ ! -d test-custom/.claude/skills/commit-helper ]"
check "agent-browser skipped (custom)" "[ ! -d test-custom/.claude/skills/agent-browser ]"

echo ""
echo "=== Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

# Cleanup
rm -rf "$TEST_DIR"

if [ $FAIL -eq 0 ]; then
  echo "All tests passed!"
  exit 0
else
  echo "Some tests failed!"
  exit 1
fi
```

## Troubleshooting

### Skills not installing
- Check that `assets/skills.json` exists and is valid JSON
- Verify the skill asset paths exist under `assets/claude/skills/`

### Remote skills failing
- Remote skills require network access and `npx skills` CLI
- Failures are non-fatal and logged as warnings

### Custom manifest not working
- Verify the path is absolute or relative to current directory
- Check JSON syntax is valid
- Ensure `source: "local"` skills reference valid asset paths
