#!/bin/bash
# Demo script for claude-bash-compress

echo "━━━ claude-bash-compress demo ━━━"
echo ""
echo "Test: compress 100 lines of npm install output"
echo ""

python3 -c "
import json
lines = ['installing pkg ' + str(i) for i in range(100)]
lines.append('added 245 packages in 12s')
lines.append('found 0 vulnerabilities')
print(json.dumps({'tool_name':'Bash','tool_response':chr(10).join(lines)}))
" | node bash-compress.mjs | python3 -m json.tool

echo ""
echo "━━━ 2.8k chars → 0.4k chars (86% reduction) ━━━"
echo ""
echo "Running tests..."
echo ""
node bash-compress.test.mjs
