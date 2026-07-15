#!/bin/bash
# Start/ensure game engine is running
if ! ss -tlnp 2>/dev/null | grep -q ":3003"; then
  cd /home/z/my-project/mini-services/game-engine
  nohup bun --hot index.ts > /home/z/my-project/engine.log 2>&1 &
  disown -a
  sleep 2
fi

# Start/ensure Next.js dev server is running
if ! ss -tlnp 2>/dev/null | grep -q ":3000"; then
  cd /home/z/my-project
  nohup node node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
  disown -a
  sleep 5
fi

# Verify
echo "Ports:"
ss -tlnp 2>/dev/null | grep -E "3000|3003"
