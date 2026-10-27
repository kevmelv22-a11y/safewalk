#!/bin/sh
# Genereert convex/_generated tegen de lokale anonieme backend (geen account nodig)
CONVEX_AGENT_MODE=anonymous npx convex dev --once --typecheck disable >/tmp/convex-codegen.log 2>&1; s=$?
pkill -f convex-local-backend 2>/dev/null; tail -1 /tmp/convex-codegen.log; exit $s
