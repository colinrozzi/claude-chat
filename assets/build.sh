#!/bin/bash
# This script builds the JavaScript bundle for the Claude Chat frontend
# Make this script executable with: chmod +x build.sh
# Make this script executable with: chmod +x build.sh

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create dist directory if it doesn't exist
mkdir -p dist

# Build the JavaScript bundle
echo "Building JavaScript bundle..."
npm run build

echo "Bundle created successfully!"
