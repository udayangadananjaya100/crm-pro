#!/bin/bash

echo "==============================================="
echo "      Pro CRM — Automated Update Script        "
echo "==============================================="

# Check if it's a git repository
if [ -d ".git" ]; then
    echo "🔄 Fetching latest updates from Git..."
    git pull
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to pull updates from Git."
        exit 1
    fi
else
    echo "ℹ️  Note: Not a Git repository. Skipping git pull."
fi

# Rebuild and restart containers
echo "🚀 Rebuilding and restarting containers..."
docker compose up -d --build

# Run database migrations just in case
echo "📂 Running database migrations..."
docker exec procrm_app npm run db:migrate

echo "==============================================="
echo "🎉 Update Complete!"
echo "Pro CRM has been updated to the latest version."
echo "==============================================="
