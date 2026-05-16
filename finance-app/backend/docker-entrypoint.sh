#!/bin/sh
set -e

# SQLite doesn't work reliably over network filesystems (Azure Files / SMB).
# Strategy: copy DB from persistent mount to local ephemeral storage,
# run SQLite locally (fast + proper locking), sync changes back periodically.

MOUNT_DIR="${MOUNT_DIR:-/data}"
LOCAL_DIR="/app/localdata"
mkdir -p "$LOCAL_DIR"

# Copy files from mount to local if they exist
if [ -d "$MOUNT_DIR" ]; then
  echo "Syncing data from $MOUNT_DIR to $LOCAL_DIR..."
  for f in "$MOUNT_DIR"/*.db "$MOUNT_DIR"/*.xlsx; do
    [ -f "$f" ] && cp "$f" "$LOCAL_DIR/" && echo "  Copied $(basename "$f")"
  done
fi

# Override DB_PATH and ACCOUNTING_XLSX to point to local copies
if [ -f "$LOCAL_DIR/finance.db" ]; then
  export DB_PATH="$LOCAL_DIR/finance.db"
  echo "Using local DB: $DB_PATH"
else
  export DB_PATH="$LOCAL_DIR/finance.db"
  echo "No existing DB found, will create fresh: $DB_PATH"
fi

if [ -f "$LOCAL_DIR/accounting.xlsx" ]; then
  export ACCOUNTING_XLSX="$LOCAL_DIR/accounting.xlsx"
  echo "Using local XLSX: $ACCOUNTING_XLSX"
fi

# Start uvicorn
exec uvicorn main:app --host 0.0.0.0 --port 8000
