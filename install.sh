#!/bin/bash
# claude-bash-compress installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Cyvid7-Darus10/claude-bash-compress/main/install.sh | bash

set -e

HOOK_DIR="$HOME/.claude/hooks"
HOOK_FILE="$HOOK_DIR/bash-compress.mjs"
SETTINGS_FILE="$HOME/.claude/settings.json"
REPO_URL="https://raw.githubusercontent.com/Cyvid7-Darus10/claude-bash-compress/main/bash-compress.mjs"

echo ""
echo "  claude-bash-compress installer"
echo "  ──────────────────────────────"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js not found. Install Node.js 20+ first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  ✗ Node.js $NODE_VERSION found, but 20+ required."
  exit 1
fi
echo "  ✓ Node.js $(node -v) detected"

# Download hook
mkdir -p "$HOOK_DIR"
if curl -fsSL -o "$HOOK_FILE" "$REPO_URL"; then
  echo "  ✓ Downloaded bash-compress.mjs to $HOOK_DIR/"
else
  echo "  ✗ Failed to download. Check your internet connection."
  exit 1
fi

# Check if settings.json exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "  ✗ $SETTINGS_FILE not found. Is Claude Code installed?"
  echo "    Run Claude Code once first, then re-run this installer."
  exit 1
fi

# Check if hook is already installed
if grep -q "bash-compress" "$SETTINGS_FILE" 2>/dev/null; then
  echo "  ✓ Hook already registered in settings.json (skipped)"
  echo ""
  echo "  Done! Restart Claude Code to activate."
  echo ""
  exit 0
fi

# Add hook to settings.json using Node.js (safe JSON manipulation)
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));

if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

// Check if already installed
const exists = settings.hooks.PostToolUse.some(h =>
  h.hooks?.some(hook => hook.command?.includes('bash-compress'))
);

if (!exists) {
  settings.hooks.PostToolUse.unshift({
    matcher: 'Bash',
    hooks: [{
      type: 'command',
      command: 'node \"\$HOME/.claude/hooks/bash-compress.mjs\"'
    }]
  });
  fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
  console.log('  ✓ Hook registered in settings.json');
} else {
  console.log('  ✓ Hook already registered (skipped)');
}
"

echo ""
echo "  Done! Restart Claude Code to activate."
echo "  Bash output over 500 chars will be automatically compressed."
echo ""
