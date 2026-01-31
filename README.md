# Setup & Build Instructions

## 1. Install dependencies

```bash
npm install
```

## 1.1. Install pkg (for building standalone binary)

```bash
npm install pkg
```

## 2. Rename template files and the chosen startup script

- Copy `config_template.json` to `config.json` and edit as needed:

```bash
cp config_template.json config.json
nano config.json   # or use your preferred editor
```

- Choose your startup script and rename it to `startup.sh` (for example, to use `startup-restart.sh`) (optional):

```bash
cp Pterodactyl-stuff/startup-restart.sh Pterodactyl-stuff/startup.sh
```

## 2.5. Update `config.json`

- Edit `config.json` and fill in your Discord bot token, webhooks, server/channel IDs, API keys, and other required fields.

## 3. Build JavaScript

- Run or build `index.js`
```
node index.js
# or 
nvm run v18x index.js # or similar
```

## 4. Build standalone binary with pkg (optional)

```bash
npx pkg . --output chatBridge
```

This will generate the `chatBridge` executable.

## 5. Compile the Java startup wrapper (optional)

If you want to use the Java startup wrapper in `Pterodactyl-stuff/startup-jar`:

```bash
cd Pterodactyl-stuff/startup-jar
javac ShellExecutor.java
jar cfm startup.jar manifest.txt ShellExecutor.class
```

This will produce `startup.jar` which can be run as an executable.

---

## Usage

### Starting the Bot

- After setup and build, run the bot with:
  ```bash
  node index.js
  ```
  or, if you built the binary:
  ```bash
  ./chatBridge
  ```

### Discord Commands

The bot supports the following slash commands in your Discord server:

- `/help` — Lists available commands.
- `/players` — Shows the current online players.
- `/backup [force] [name]` — Creates a server backup. Use `force` to delete the oldest backup if the limit is reached. (Admin only)
- `/start` — Starts the server. (Admin only)
- `/stop` — Stops the server. (Admin only)
- `/restart` — Restarts the server. (Admin only)
- `/owoify <mode>` — Sets chat owoification mode (`none`, `owo`, `uwu`, `uvu`).
- `/command <cmd>` — Sends a console command to the server. (Admin only)
- `/reinitialize` - reinitializes log listener and RCON connection (Admin only)

### Chat Relay

- Any message sent in the configured Discord channel will be relayed to the Minecraft server chat.
- Minecraft chat and server events are relayed back to Discord via webhook.

### Log Channel

- If you set the `server_log_webhook` variable in `config.json`, the bot will send Minecraft server logs and crash alerts (pings the admin role via `adminRole`) to the specified Discord channel via webhook.

### Admin Permissions

- Only users listed in the `admins` array in `config.json` can use admin commands.

### Troubleshooting

- Check your `config.json` for correct tokens, webhooks, and channel IDs.
- Ensure your bot has permission to read/send messages and use slash commands in the target channel.

---

## CREDITS

LLMs helped quite a bit
[Minecraft-Discord-Chat-Bridge](https://github.com/VampireChicken12/Minecraft-Discord-Chat-Bridge)
[Mineflayer-Chatbridge](https://github.com/printinqq/Mineflayer-Chatbridge)
