# Chatbridge Pterodactyl Egg Setup Guide

This guide will help you set up the Chatbridge Discord-Minecraft bridge as a Pterodactyl egg.

## Prerequisites

- A running Pterodactyl Panel (local or remote)
- A Discord bot application and token
- A Minecraft server egg running on the same Pterodactyl instance (or accessible via RCON)
- Discord webhooks for chat relay

## Architecture

```
Discord Server
    ↓
    ├→ Chatbridge Bot (this egg)
    │     ↓
    │     ├→ Pterodactyl API (local instance)
    │     │     ↓
    │     │     └→ Minecraft Server Egg (control via console)
    │     │
    │     └→ RCON Connection (localhost:25575)
    │           ↓
    │           └→ Minecraft Server (chat relay & log monitoring)
    │
    └→ Discord Webhooks (chat & logs)
```

## Step 1: Import the Egg into Pterodactyl

1. Log into your Pterodactyl Panel as an administrator
2. Navigate to **Admin Panel** → **Nests** → **Eggs**
3. Click **Import Egg**
4. Upload the **egg.json** file or paste its contents
5. Select the appropriate **Nest** (e.g., "Dev Server" or create a new one)
6. Click **Import**

## Step 2: Create a Server from the Egg

1. Go to **Admin Panel** → **Servers** → **Create New**
2. Fill in server details:
   - **Server Name**: Chatbridge
   - **Owner**: Select the desired user
   - **Nest**: Select the nest where you imported the egg
   - **Egg**: Select "Discord - Minecraft Chat Bridge"
   - **Default Allocation**: Assign an allocation
3. Scroll through **Startup Command** and configure the environment variables

## Step 3: Configure Environment Variables

In the Pterodactyl server creation form, set these variables:

### Discord Configuration
- **Discord Bot Token** (`DISCORD_TOKEN`): Your bot's token from [Discord Developer Portal](https://discord.com/developers)
- **Discord Webhook URL** (`DISCORD_WEBHOOK`): Webhook URL for relaying Minecraft chat to Discord
- **Discord Chat Channel ID** (`DISCORD_CHAT_CHANNEL`): The channel ID where chat will appear
- **Discord Log Webhook** (`DISCORD_LOG_WEBHOOK`): Optional webhook for server logs and crash alerts
- **Discord Admin IDs** (`DISCORD_ADMINS`): Comma-separated user IDs (e.g., `123456789,987654321`)
- **Discord Admin Role ID** (`DISCORD_ADMIN_ROLE`): Role ID for admin notifications

### Pterodactyl API Configuration
- **Pterodactyl API Key** (`PTERODACTYL_API_KEY`): API key from your Pterodactyl account (User → API Credentials)
- **Pterodactyl API URL** (`PTERODACTYL_API_URL`): Set to `http://localhost` for local panel, or your panel URL
  - For local/same-network: `http://localhost` or `http://panel.local`
  - For remote: `https://panel.example.com`
- **Pterodactyl Server ID** (`PTERODACTYL_SERVER_ID`): UUID of your Minecraft server

### Minecraft Server Configuration (Bridge)
- **RCON Host** (`RCON_HOST`): `localhost` (same container network) or the Minecraft server's IP
- **RCON Port** (`RCON_PORT`): Usually `25575`
- **RCON Password** (`RCON_PASSWORD`): The RCON password set in your server.properties
- **Log File Path** (`LOG_FILE_PATH`): Path relative to the server root (default: `logs/latest.log`)

### Optional
- **Container Port** (`PORT`): Internal port (default: `25568`)

## Step 4: Create Discord Bot & Webhooks

### Create Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** and create a new bot user
4. Copy the token and paste into `DISCORD_TOKEN`
5. Under **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Manage Webhooks`, `Read Message History`
6. Use the generated URL to invite the bot to your server

### Create Webhooks
1. In your Discord server, go to **Server Settings** → **Integrations** → **Webhooks**
2. Create a webhook for chat relay
3. Copy the webhook URL and paste into `DISCORD_WEBHOOK`
4. (Optional) Create another webhook for logs and paste into `DISCORD_LOG_WEBHOOK`

## Step 5: Get Pterodactyl API Key

1. Log into your Pterodactyl Panel
2. Click your account (top right) → **Account Settings**
3. Go to **API Credentials** → **Create New**
4. Generate an API token and copy it to `PTERODACTYL_API_KEY`

## Step 6: Link Minecraft Server

The Chatbridge bot communicates with your Minecraft server via RCON. Ensure:

1. **RCON is enabled** in your Minecraft server's `server.properties`:
   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=YOUR_SECURE_PASSWORD
   ```

2. **Chatbridge RCON settings** match your server:
   - If running on same physical machine/network: `RCON_HOST=localhost`
   - If running on different machine: Use the Minecraft server's IP address

3. **Logs accessible**: The Minecraft server must have its logs accessible at the path specified in `LOG_FILE_PATH`

## Step 7: Start the Server

1. In the Pterodactyl Panel, navigate to your Chatbridge server
2. Click **Start** 
3. Monitor the console for successful startup:
   ```
   node v18.x.x
   :/home/container$ node index.js
   logged in
   ```

## Usage

Once running, the bot provides these Discord commands:

- `/help` - Lists available commands
- `/players` - Shows online players
- `/backup [force] [name]` - Create backups (admin)
- `/start` - Start the Minecraft server (admin)
- `/stop` - Stop the Minecraft server (admin)
- `/restart` - Restart the Minecraft server (admin)
- `/owoify <mode>` - Set chat owoification mode
- `/command <cmd>` - Send console commands (admin)
- `/reinitialize` - Reinitialize log listener (admin)

## Troubleshooting

### Bot won't start
- Check that all required environment variables are set
- Verify Discord bot token is correct
- Check Pterodactyl API credentials

### Chat not relaying
- Verify Discord webhook URL is correct
- Ensure the bot has message send permissions in the channel
- Check that the Discord channel ID is correct

### RCON connection fails
- Verify RCON is enabled on the Minecraft server
- Check RCON password matches `server.properties`
- Ensure RCON host and port are correct
- For remote servers, ensure the port is accessible

### Logs not appearing
- Verify `LOG_FILE_PATH` points to the correct log file (relative to server root)
- Ensure the path exists: `logs/latest.log`
- Check file permissions

## Docker Image & Building

The Dockerfile uses `node:18-alpine` for a lightweight Node.js environment. To manually build:

```bash
docker build -t chatbridge:latest .
```

The image follows Pterodactyl's container requirements:
- Non-root user `container` with home `/home/container`
- Uses Alpine Linux for minimal size
- Executes via `entrypoint.sh` with variable substitution

## Architecture Notes

- **Discord ↔ Chatbridge**: Discord.js connects to Discord API
- **Chatbridge ↔ Pterodactyl**: HTTP API calls for server control
- **Chatbridge ↔ Minecraft**: RCON protocol for chat/command relay
- **Logging**: Watches server log file and posts updates to webhook

All communication happens through the Chatbridge container, making it the bridge between Discord and your Minecraft infrastructure.
