#!/bin/bash

# Start the WhatsApp Bridge
# This script starts the Go bridge that connects to WhatsApp Web

cd "$(dirname "$0")/whatsapp-bridge"

echo "Starting WhatsApp Bridge..."
echo "On first run, you'll need to scan a QR code with WhatsApp on your phone."
echo ""

./whatsapp-bridge




