#!/bin/bash

# Chrome Extension Packaging Script
# Creates a ZIP file ready for Chrome Web Store upload

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Get version from manifest.json
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | grep -o '[0-9.]*')
OUTPUT_NAME="life-in-uk-test-tracker-v${VERSION}.zip"
BUILD_DIR="dist"

echo "Packaging extension v${VERSION}..."

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Extension files to include
FILES=(
    "manifest.json"
    "background.js"
    "content.js"
    "csv-export-worker.js"
    "entry.js"
    "popup.html"
    "popup.css"
    "sidepanel.html"
    "sidepanel.css"
    "shared.js"
    "shared.css"
    "storage-abstraction.js"
    "icon16.png"
    "icon48.png"
    "icon128.png"
)

# Copy files to build directory
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BUILD_DIR/"
        echo "  ✓ $file"
    else
        echo "  ✗ WARNING: $file not found"
    fi
done

# Create ZIP
cd "$BUILD_DIR"
zip -r "../$OUTPUT_NAME" . -x "*.DS_Store"
cd ..

# Cleanup build directory
rm -rf "$BUILD_DIR"

# Show result
ZIP_SIZE=$(ls -lh "$OUTPUT_NAME" | awk '{print $5}')
echo ""
echo "✓ Created: $OUTPUT_NAME ($ZIP_SIZE)"
echo ""
echo "Upload this file to: https://chrome.google.com/webstore/devconsole"
