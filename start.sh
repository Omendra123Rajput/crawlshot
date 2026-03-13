#!/bin/bash
# Start both API and Worker in the same container so they share the filesystem

# Start worker in background
node --import tsx services/worker/src/index.ts &
WORKER_PID=$!

# Start API in foreground
node --import tsx apps/api/src/index.ts &
API_PID=$!

# If either process exits, shut down both
trap "kill $WORKER_PID $API_PID 2>/dev/null; exit" SIGTERM SIGINT

# Wait for either to exit
wait -n
EXIT_CODE=$?

# Kill the other process
kill $WORKER_PID $API_PID 2>/dev/null
exit $EXIT_CODE
