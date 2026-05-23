#!/usr/bin/env bash
# Serve the mirror on http://localhost:8765 — localhost is a secure context so WebHID works.
# Uses serve.py (pure stdlib) for SPA history-fallback so the app's client-side routes
# (/devices, /select-receiver, …) don't 404 on a hard navigation.
set -euo pipefail
exec python3 "$(dirname "$0")/serve.py"
