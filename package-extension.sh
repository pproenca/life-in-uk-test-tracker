#!/bin/bash

# Chrome Extension Packaging Script
# Creates a signed CRX file for Verified CRX uploads to Chrome Web Store
# Uses 1Password CLI for secure key retrieval

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 1Password reference for the private key
OP_KEY_REF="op://Private/chrome-extension-key/private key"

# Get version from manifest.json
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | grep -o '[0-9.]*')
OUTPUT_NAME="life-in-uk-test-tracker-v${VERSION}"
BUILD_DIR="dist"
KEY_FILE="$SCRIPT_DIR/.extension-key.pem"

echo "Packaging extension v${VERSION} (Verified CRX)..."

# Retrieve private key from 1Password
echo "Retrieving private key from 1Password..."
if ! command -v op &> /dev/null; then
    echo "Error: 1Password CLI (op) not found. Install it from https://1password.com/downloads/command-line/"
    exit 1
fi

op read "$OP_KEY_REF" > "$KEY_FILE" 2>/dev/null || {
    echo "Error: Failed to retrieve key from 1Password"
    echo "Make sure you're signed in: op signin"
    echo "Expected reference: $OP_KEY_REF"
    rm -f "$KEY_FILE"
    exit 1
}
chmod 600 "$KEY_FILE"
echo "  ✓ Private key retrieved"

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

# Find Chrome executable
if [[ "$OSTYPE" == "darwin"* ]]; then
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CHROME=$(which google-chrome || which chromium-browser || which chromium)
else
    CHROME=$(which chrome || which google-chrome)
fi

if [ ! -x "$CHROME" ] && [ ! -f "$CHROME" ]; then
    echo "Error: Chrome not found. Please install Chrome or set CHROME env var."
    rm -f "$KEY_FILE"
    rm -rf "$BUILD_DIR"
    exit 1
fi

# Pack extension as CRX
echo "Packing extension as CRX..."
"$CHROME" --pack-extension="$BUILD_DIR" --pack-extension-key="$KEY_FILE" --no-message-box 2>/dev/null || {
    echo "Error: Failed to pack extension"
    rm -f "$KEY_FILE"
    rm -rf "$BUILD_DIR"
    exit 1
}

# Chrome creates dist.crx in the parent directory
mv "$BUILD_DIR.crx" "$OUTPUT_NAME.crx"

# Also create a ZIP for fallback/comparison
cd "$BUILD_DIR"
zip -r "../$OUTPUT_NAME.zip" . -x "*.DS_Store"
cd ..

# Cleanup
rm -f "$KEY_FILE"
rm -rf "$BUILD_DIR"

# Show result
CRX_SIZE=$(ls -lh "$OUTPUT_NAME.crx" | awk '{print $5}')
ZIP_SIZE=$(ls -lh "$OUTPUT_NAME.zip" | awk '{print $5}')
echo ""
echo "✓ Created: $OUTPUT_NAME.crx ($CRX_SIZE) - for Verified CRX upload"
echo "✓ Created: $OUTPUT_NAME.zip ($ZIP_SIZE) - fallback ZIP"
echo ""
echo "Upload the CRX file to: https://chrome.google.com/webstore/devconsole"
echo "(Enable 'Verified CRX uploads' in your developer settings first)"
