#!/bin/bash
set -u

JAR="quilt.jar"
CRASH_DIR="crash-reports"

echo ">>> Startup wrapper active"
mkdir -p "$CRASH_DIR"
chmod +x chatBridge

BASELINE_CRASH=$(ls -t "$CRASH_DIR"/crash-* 2>/dev/null | head -n 1 || true)

while true; do
    echo ">>> Starting server (foreground)..."

    # --- Crash watcher ---
    (
        while true; do
            NEW_CRASH=$(ls -t "$CRASH_DIR"/crash-* 2>/dev/null | head -n 1 || true)

            if [[ -n "$NEW_CRASH" ]] && [[ "$NEW_CRASH" != "$BASELINE_CRASH" ]]; then
                echo ">>> NEW crash detected: $NEW_CRASH"
                kill -TERM "$(pgrep -f "$JAR")" 2>/dev/null
                exit 0
            fi

            sleep 1
        done
    ) &
    WATCHER_PID=$!
    # --- Chat bridge launcher ---
    (
        LOG_FILE="logs/latest.log"

        tail -n0 -F "$LOG_FILE" | while read -r line; do
            if [[ "$line" =~ RCON\ running\ on ]]; then
                echo ">>> RCON ready, launching chatBridge..."
                setsid bash -c './chatBridge' &> /dev/null &
                break
            fi
        done
    ) &
    
    # --- Run server in foreground ---
    java -Xms128M -XX:MaxRAMPercentage=95.0 -jar "$JAR"
    EXIT_CODE=$?

    kill "$WATCHER_PID" 2>/dev/null || true

    echo ">>> Server exited with code $EXIT_CODE"

    # --- Clean stop ---
    if [[ $EXIT_CODE -eq 0 ]]; then
        echo ">>> Server stopped cleanly"
        exit 0
    fi

    # --- SIGTERM from panel ---
    if [[ $EXIT_CODE -eq 143 ]]; then
        echo ">>> Server terminated by panel"
        exit 0
    fi

    # --- Crash ---
    echo ">>> Server crashed, restarting in 1s..."
    BASELINE_CRASH=$(ls -t "$CRASH_DIR"/crash-* 2>/dev/null | head -n 1 || true)
    sleep 1
done
