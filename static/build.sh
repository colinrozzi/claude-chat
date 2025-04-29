#!/bin/bash
# Make this script executable with: chmod +x build.sh

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build the JavaScript bundle
echo "Building JavaScript bundle..."
npm run build

echo "Bundle created successfully!"
