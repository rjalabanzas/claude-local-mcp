# Running the WhatsApp Bridge

The WhatsApp bridge must run continuously to maintain your WhatsApp connection.

## How to Start

Open a **new terminal window** and run:

```bash
cd /Users/philip.dalen/repos/mcp/servers/whatsapp/community/whatsapp-mcp/whatsapp-bridge
./whatsapp-bridge
```

Or use the convenience script:

```bash
cd /Users/philip.dalen/repos/mcp/servers/whatsapp/community/whatsapp-mcp
./start-bridge.sh
```

## First Time Setup

When you run the bridge for the first time, you'll see:

1. **A QR code displayed in the terminal**
2. Instructions to scan it with WhatsApp on your phone

### Steps to Link Your WhatsApp:

1. Open WhatsApp on your phone
2. Go to **Settings** (iPhone) or **⋮ menu** (Android)
3. Tap **Linked Devices**
4. Tap **Link a Device**
5. Point your phone at the QR code in the terminal

### After Scanning:

- The bridge will say "Connected" or similar
- It will start syncing your message history (this can take a few minutes)
- The REST API will start on port 8080
- You'll see log messages as messages are synced

## Keep It Running

**Important:** Keep this terminal window open and the bridge running!

- The bridge maintains your WhatsApp connection
- If you close it, the MCP server won't be able to send/receive messages
- You can minimize the window, but don't close it

## Already Authenticated?

If you've already linked the device before, the bridge will automatically reconnect using the saved session in `store/whatsapp.db`.

## Stopping the Bridge

To stop the bridge:

- Press `Ctrl+C` in the terminal where it's running
- Or run: `pkill -f whatsapp-bridge`

## Troubleshooting

### "Failed to connect"

- Make sure your computer has internet access
- Try deleting `store/whatsapp.db` and re-authenticating

### "QR code expired"

- Just restart the bridge (`Ctrl+C` then run again)
- You'll get a new QR code

### Port 8080 already in use

- Another service is using port 8080
- Stop that service or modify the bridge code to use a different port

---

**Ready?** Open a new terminal and start the bridge! 🚀



