const owoify = require('owoify-js').default;
const Rcon = require('rcon');
const fs = require('fs');
const { watch } = require('fs');
const {
  Client,
  GatewayIntentBits,
  WebhookClient,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");

const {
  token,
  chat_channel,
  server_log_webhook,
  webhook,
  admins,
  adminRole,
  apiKey,
  apiUrl,
  serverId,
  rcon_host,
  rcon_port,
  rcon_password,
  log_file_path,
} = require("./config.json");

let owoState = "none";
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


const WEBHOOK = new WebhookClient({ url: webhook });
const serverLogWebhook = server_log_webhook ? new WebhookClient({ url: server_log_webhook }) : null;
let rcon = null;
let lastFileSize = 0;
let lineBuffer = "";
let logWatcher = null;
let reinitInProgress = false;

// Generic Pterodactyl API request function
async function ptero(endpoint, method = "GET", body, raw = false) {
  console.log(`Ptero API Request: ${method} ${endpoint}`);
  await console.log(`Body: ${body ? JSON.stringify(body) : "N/A"}`);
  const res = await fetch(`${apiUrl}/api/client${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API failed: ${res.status} ${text}`);
  }

  return raw ? res : res.json();
}

// Initialize RCON connection
async function initRcon() {
  return new Promise((resolve, reject) => {
    rcon = new Rcon(rcon_host, rcon_port, rcon_password, {
      tcp: true,
      challenge: true,
    });

    rcon.on('auth', () => {
      console.log('RCON: Authenticated');
      resolve(true);
    });

    rcon.on('error', (err) => {
      console.error('RCON Error:', err);
      reject(err);
    });

    rcon.on('end', () => {
      console.warn('RCON disconnected — reconnecting in 5s');
      setTimeout(initRcon, 5000);
    });

    rcon.connect();
  });
}

// Send console command via RCON
async function sendConsoleCommand(cmd) {
  if (!rcon) {
    console.error('RCON not connected');
    return;
  }

  try {
    console.log("Sending console command (RCON):", cmd);
    rcon.send(cmd);
  } catch (err) {
    console.error("RCON send command error:", err);
  }
}

// Send console command via Pterodactyl API
async function sendConsoleCommandAPI(cmd) {
  try {
    console.log("Sending console command (API):", cmd);
    const res = await fetch(`${apiUrl}/api/client/servers/${serverId}/command`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "Application/vnd.pterodactyl.v1+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command: cmd }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API failed: ${res.status} ${text}`);
    }
    console.log("Command sent successfully via API");
  } catch (err) {
    console.error("API command error:", err);
    throw err;
  }
}

// Power actions: start, stop, restart
async function power(action) {
  try {
    const res = await fetch(`${apiUrl}/api/client/servers/${serverId}/power`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "Application/vnd.pterodactyl.v1+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signal: action }),
    });

    if (res.status === 204) {
      console.log(`Server ${action} successfully.`);
    } else {
      const text = await res.text();
      console.error("Error:", text);
    }
  } catch (err) {
    console.error(err);
  }
}

// Filters console lines for chat messages
function filterConsole(line) {
  if (typeof line !== "string") return null;

  const CHAT_REGEX =
    /^\[\d{2}:\d{2}:\d{2}\]\s+\[(?:Server thread|Netty Server IO #\d+)\/INFO\]:\s+(?:<([A-Za-z0-9_]{1,16})>\s+(.*)|\*\s+([A-Za-z0-9_]{1,16})\s+(.*)|([A-Za-z0-9_]{1,16})\s+((joined.*)|(left.*)|(was.+|fell.*|drowned.*|hit.*|tried.*|went.*|suff.*|burne.*|blew.*|disco.*|wither.*)|(has made.*)))$/;

  // custom emojis
  // set these in your bot settings and paste the markdown here
  // idk who made these emojis so no credits
  const joinEmoji  = "<:join:1466577873010692106> ";
  const leaveEmoji = "<:leave:1466577874038423797> ";
  const deathEmoji = "<:death:1466577871714910312> ";
  const advancementEmoji = "<:achievement:1466577870510886999> ";
  

  const match = line.match(CHAT_REGEX);
  if (!match) return null;

  // normal chat: <player> message
  if (match[1] && match[2]) {
    return { sender: match[1], message: match[2] };
  }

  // action chat: * player message
  if (match[3] && match[4]) {
    return { sender: match[3], message: match[4] };
  }

  // server messages: join / leave / death
  if (match[5] && match[6]) {
    updateChannelWithServerStats();

    let emoji = "";
    if (match[7]) emoji = joinEmoji;        // joined.*
    else if (match[8]) emoji = leaveEmoji;  // left.*
    else if (match[9]) emoji = deathEmoji;  // death messages
    else if (match[10]) emoji = advancementEmoji; // advancements
    return {
      sender: "Server",
      message: `${emoji}${match[5]} ${match[6]}`
    };
  }


  return null;
}


const playerStatsManager = (() => {
  const latestPlayerStats = {
    online: 0,
    max: 0,
    players: []
  };

  let pendingLine = null;
  let timerStarted = false;

  const UPDATE_INTERVAL_MS = 150_000; // 2.5 minutes

  return function playerStatsManager(action, line) {
    if (action === "update") {
      if (!line || typeof line !== "string") return;

      // Always overwrite with latest line
      pendingLine = line;

      // Start the interval only once
      if (!timerStarted) {
        timerStarted = true;

        setInterval(() => {
          if (!pendingLine) return;

          const msgMatch = pendingLine.match(/^\[[^\]]+]\s+\[[^\]]+]:\s+(.*)$/);
          const msg = msgMatch ? msgMatch[1] : pendingLine;

          // Player count
          const countMatch = msg.match(/There are (\d+)\/(\d+) players online/i);
          if (countMatch) {
            latestPlayerStats.online = parseInt(countMatch[1], 10);
            latestPlayerStats.max = parseInt(countMatch[2], 10);
            latestPlayerStats.players = [];
            pendingLine = null;
            return;
          }

          // Collect names
          if (latestPlayerStats.online > 0) {
            const parts = msg.trim().split(",").map(p => p.trim());

            for (const name of parts) {
              if (/^[A-Za-z0-9_]{3,16}$/.test(name)) {
                if (!latestPlayerStats.players.includes(name)) {
                  latestPlayerStats.players.push(name);
                }
              }
            }
          }

          pendingLine = null;
        }, UPDATE_INTERVAL_MS);
      }

    } else if (action === "get") {
      return { ...latestPlayerStats };
    }
  };
})();



// Updates the Discord channel topic with server stats
async function updateChannelWithServerStats() {
  try {
    console.log("Updating channel topic with server stats...");
    const channel = await client.channels.fetch(chat_channel);
    const r = await ptero(`/servers/${serverId}/resources`);
    const s = r.attributes;
    await sendConsoleCommandAPI("list");
    await new Promise(r => setTimeout(r, 1000));
    const stats = playerStatsManager("get");

    const playersOnline = stats.online;
    const maxPlayers = stats.max;
    const playerList = stats.players.length > 0 ? stats.players.join(", ") : "";

    console.log(`Players online: ${playersOnline}/${maxPlayers}`);
    console.log(`Player list: ${playerList}`);

    const topic =
      `State: ${s.current_state}` +
      ` | RAM: ${(s.resources.memory_bytes / 1048576).toFixed(0)}MB` +
      ` | Online: ${playersOnline}` + (playersOnline == "0" ? "" : `| Players: ${playerList}`);
    console.log("New topic:", topic);
    await channel.setTopic(topic);
  } catch (err) {
    console.error("Topic update failed:", err);
  }
}

// Log all console output (for debugging commands)
let skippingPlayerList = false;

function logAllConsole(line) {
  if (typeof line !== "string") return;
  
  // match to `[Server thread/ERROR]:.*/home/container/./crash-reports` and ping admin if found
  const crashMatch = line.match(/^\[\d{2}:\d{2}:\d{2}\]\s+\[Server thread\/ERROR\]:\s+.*(\/home\/container\/\.\/crash-reports.*)$/);
  if (crashMatch) {
    if (serverLogWebhook) {
      serverLogWebhook.send({
        username: "Crash Alert",
        content: `<@&${adminRole}>`,
        avatarURL: `https://www.freeiconspng.com/download/40686`,
      });
    }
  }
  
  // Extract the actual message part after timestamp and thread info
  const msgMatch = line.match(/^\[\d{2}:\d{2}:\d{2}\]\s+\[[^\]]+\/[A-Z]+\]:\s+(.*)$/);
  
  // Check for player count header line
  const playerCountMatch = line.match(/^\[\d{2}:\d{2}:\d{2}\]\s+\[[^\]]+\/INFO\]:\s+There are \d+\/\d+ players online:/);
  
  // Check for empty line (end of player list)
  
  console.log("FULL LOG MSG:", line);
  console.log("EXTRACTED MSG:", msgMatch ? msgMatch[1] : "N/A");
  
  // If we find a player count header, start skipping
  if (playerCountMatch) {
    skippingPlayerList = true;
    console.log("START SKIPPING: Player count header found");
    return;
  }
  
  // If we're skipping player list and find an empty line, stop skipping
  if (skippingPlayerList) {
    skippingPlayerList = false;
    console.log("STOP SKIPPING");
    return;
  }
  
  // Skip if we're in player list mode
  if (skippingPlayerList) {
    console.log("SKIPPING: Player list line");
    return;
  }
  
  // Check if the extracted message is not empty
  if (server_log_webhook && msgMatch && msgMatch[1].trim() !== "") {
    serverLogWebhook.send({
      username: "Server Log",
      content: msgMatch[1],
      avatarURL: `https://www.freeiconspng.com/download/40686`,
      flags: [4096],
    });
  }
}

// Process a single log line
function processLogLine(line) {
  logAllConsole(line);
  const filtered = filterConsole(line);

  if (!filtered) return;
  if (owoState !== "none") {
    filtered.message = owoify(filtered.message, owoState);
  }
  console.log("LOG MSG:", filtered);
  if (filtered.sender && filtered.message) {
    console.log(`LOG [${filtered.sender}]: ${filtered.message}`);
    try {
      WEBHOOK.send({
        username: filtered.sender,
        avatarURL: filtered.sender == "Server" ? `https://www.freeiconspng.com/download/40686` : `https://minotar.net/avatar/${filtered.sender}`,
        content: filtered.message,
        flags: [4096],
      });
    } catch (err) {
      console.error("Webhook send error:", err);
    }
  }
}

// Helper: Convert decimal to hex for colors
function decimalToHex(d, padding) {
  let hex = Number(d).toString(16);
  padding = typeof padding === "undefined" || padding === null ? 2 : padding;
  while (hex.length < padding) {
    hex = "0" + hex;
  }
  return hex.toUpperCase();
}

// Helper: Check if string is a valid URL
function validURL(str) {
  const urlRegex = "^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d\\{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$";
  const url = new RegExp(urlRegex, "i");
  return url.test(str.replace(/(<|>)/g, ""));
}

// Split strings keeping separators
function splitAndKeep(str, separator, method = "separate") {
  let result = [];
  if (method === "separate") {
    result = str.split(new RegExp(`(${separator})`, "g"));
  } else if (method === "beginning") {
    result = str.split(new RegExp(`(?=${separator})`, "g"));
  } else if (method === "behind") {
    result = str.split(new RegExp(`(.*?${separator})`, "g"));
    result = result.filter((el) => el !== "");
  }
  return result;
}

// Split message to max length
function splitToSubstrings(str, splitCharacter, length) {
  const splitted = str.split(splitCharacter);
  const result = [];
  for (let portion of splitted) {
    const last = result.length - 1;
    if (result[last] && (result[last] + portion).length < length) {
      result[last] = result[last] + splitCharacter + portion;
    } else {
      result.push(portion);
    }
  }
  return result;
}

// Parse message parts and build tellraw array
function splitAndKeepParse(message, part_tellraw, message_part) {
  splitAndKeep(message_part, " ").forEach((part) => {
    if (/<@!?(\d{17,19})>/.test(part)) {
      const member = message.guild?.members.cache?.get(part.match(/<@!?(\d{17,19})>/)?.[1] ?? "");
      if (!member) return;
      part_tellraw.push({
        text: "[" + (member.nickname !== null ? member.nickname : member.user.username) + "]",
        color: "#" + decimalToHex(member.roles.highest.color),
        hoverEvent: {
          action: "show_text",
          contents: [`${member.user.username}#${member.user.discriminator}\nID: ${member.user.id}`]
        }
      });
    } else if (/<@&(\d{17,19})>/.test(part)) {
      const role = message.guild?.roles.cache.get(part.match(/<@&(\d{17,19})>/)?.[1] ?? "");
      if (!role) return;
      part_tellraw.push({
        text: "(" + role.name + ")",
        color: "#" + decimalToHex(role.color),
        hoverEvent: { action: "show_text", contents: [""] }
      });
    } else if (/<#(\d{17,19})>/.test(part)) {
      const channel = message.guild?.channels.cache.find((ch) => ch.id === part.match(/<#(\d{17,19})>/)?.[1]);
      if (!channel) return;
      part_tellraw.push({
        text: channel.name,
        color: "green",
        hoverEvent: {
          action: "show_text",
          contents: ["Click to open channel in Discord"]
        },
        clickEvent: {
          action: "open_url",
          value: `https://discord.com/channels/${channel.guildId}/${channel.id}`
        }
      });
    } else {
      if (validURL(part)) {
        part_tellraw.push({
          text: part,
          color: "blue",
          hoverEvent: {
            action: "show_text",
            contents: ["Click to open link in browser"]
          },
          clickEvent: { action: "open_url", value: part }
        });
      } else {
        if (part_tellraw.length > 0) {
          const last_message_part = part_tellraw[part_tellraw.length - 1];
          if (last_message_part.color === "white" && JSON.stringify(last_message_part.hoverEvent) === JSON.stringify({ action: "show_text", contents: [""] })) {
            last_message_part.text += part;
            return;
          }
        }
        part_tellraw.push({
          text: part,
          color: "white",
          hoverEvent: { action: "show_text", contents: [""] }
        });
      }
    }
  });
}

// Parse Discord message parts into tellraw format
function parseMessageParts(message, messages) {
  const repliedMessage = message.reference ? message.channel.messages.cache.get(message.reference?.messageId) : null;
  const tellraw_parts = [];
  
  messages.forEach((message_part) => {
    let part_tellraw = [];
    
    // Add replied message info if exists
    if (repliedMessage) {
      const repliedMember = message.guild?.members.cache.get(repliedMessage.author.id);
      if (repliedMember) {
        part_tellraw.push({
          text: `[${repliedMember?.nickname || repliedMessage.author?.username}] `,
          color: "#" + decimalToHex(repliedMember.roles.highest.color),
          hoverEvent: {
            action: "show_text",
            contents: [`${message.author?.username}#${message.author?.discriminator}\nID: ${message.author?.id}`]
          }
        });
        splitAndKeepParse(repliedMessage, part_tellraw, repliedMessage.content);
        tellraw_parts.push(part_tellraw);
        part_tellraw = [];
        
        // Add reply indicator
        part_tellraw.push({
          text: `[${message.member?.nickname || message.author?.username}] `,
          color: "#" + decimalToHex(message.member?.roles.highest.color || 0),
          hoverEvent: {
            action: "show_text",
            contents: [`${message.author?.username}#${message.author?.discriminator}\nID: ${message.author?.id}`]
          }
        });
        part_tellraw.push({
          text: "replied to ",
          color: "white",
          hoverEvent: { action: "show_text", contents: [""] }
        });
        part_tellraw.push({
          text: "[" + (repliedMember.nickname || repliedMember.user.username) + "]",
          color: "#" + decimalToHex(repliedMember.roles.highest.color),
          hoverEvent: {
            action: "show_text",
            contents: [`${repliedMember.user.username}#${repliedMember.user.discriminator}\nID: ${repliedMember.user.id}`]
          }
        });
        tellraw_parts.push(part_tellraw);
        part_tellraw = [];
      }
    }
    
    // Add main message
    part_tellraw.push({
      text: `[${message.member?.nickname || message.author?.username}] `,
      color: "#" + decimalToHex(message.member?.roles.highest.color || 0),
      hoverEvent: {
        action: "show_text",
        contents: [`${message.author?.username}#${message.author?.discriminator}\nID: ${message.author?.id}`]
      }
    });
    splitAndKeepParse(message, part_tellraw, message_part);
    tellraw_parts.push(part_tellraw);
  });
  
  return tellraw_parts;
}

// Watch the latest.log file for changes
function watchLogFile() {
  try {
    if (logWatcher) {
      logWatcher.close();
      logWatcher = null;
    }
    // Always start from the end of the file, so no old lines are processed
    try {
      const stats = fs.statSync(log_file_path);
      lastFileSize = stats.size;
    } catch (e) {
      lastFileSize = 0;
    }
    lineBuffer = "";
    console.log(`Watching ${log_file_path} for changes`);
    logWatcher = watch(log_file_path, async (eventType, filename) => {
      if (eventType !== "change") return;
      try {
        const content = fs.readFileSync(log_file_path, 'utf-8');
        const currentFileSize = content.length;
        if (currentFileSize > lastFileSize) {
          const newContent = content.slice(lastFileSize);
          lineBuffer += newContent;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              processLogLine(line);
              playerStatsManager("update", line);
            }
          }
          lastFileSize = currentFileSize;
        } else if (currentFileSize < lastFileSize) {
          lineBuffer = '';
          lastFileSize = 0;
        }
      } catch (err) {
        console.error(`Error reading log file: ${err}`);
      }
    });
  } catch (err) {
    console.error(`Failed to watch log file: ${err}`);
    setTimeout(watchLogFile, 5000);
  }
}

async function reinitializeAll() {
  if (reinitInProgress) return;
  reinitInProgress = true;
  // Reset log file state
  lastFileSize = 0;
  lineBuffer = "";
  if (logWatcher) {
    try { logWatcher.close(); } catch (e) {}
    logWatcher = null;
  }
  // Disconnect RCON if connected
  if (rcon) {
    try { rcon.disconnect(); } catch (e) {}
    rcon = null;
  }
  // Wait a moment to ensure cleanup
  await new Promise(r => setTimeout(r, 500));
  await initRcon();
  watchLogFile();
  reinitInProgress = false;
}

client.on("clientReady", async () => {
  console.log("Discord bot ready!");
  try {
    await initRcon();
    watchLogFile();
    setInterval(updateChannelWithServerStats, 300000);

    // Register slash commands
    const commands = [
      new SlashCommandBuilder()
        .setName("help")
        .setDescription("Shows available commands"),
      new SlashCommandBuilder()
        .setName("players")
        .setDescription("List players on the server"),
      new SlashCommandBuilder()
        .setName("backup")
        .setDescription("Create a server backup")
        .addBooleanOption(option => option.setName("force").setDescription("Force backup (deletes oldest if limit reached)").setRequired(false))
        .addStringOption(option => option.setName("name").setDescription("Backup name").setRequired(false)),
      new SlashCommandBuilder()
        .setName("start")
        .setDescription("Start the server"),
      new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop the server"),
      new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Restart the server"),
      new SlashCommandBuilder()
        .setName("owoify")
        .setDescription("Set chat owoification")
        .addStringOption(option =>
          option.setName("mode")
            .setDescription("Owoify mode")
            .setRequired(true)
            .addChoices(
              { name: "none", value: "none" },
              { name: "owo", value: "owo" },
              { name: "uwu", value: "uwu" },
              { name: "uvu", value: "uvu" }
            )
        ),
      new SlashCommandBuilder()
        .setName("command")
        .setDescription("Send a console command (admin only)")
        .addStringOption(option => option.setName("cmd").setDescription("Command to execute").setRequired(true)),

      new SlashCommandBuilder()
        .setName("reinitialize")
        .setDescription("Restart the log listener and RCON connection (admin only)"),
    ].map(command => command.toJSON());

    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("Slash commands registered!");
  } catch (err) {
    console.error("Initialization failed:", err);
  }
});

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    // Handle regular messages (non-command chat relay)
    return;
  }

  const { commandName } = interaction;

  try {
    if (commandName === "help") {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply({
        content: "Available commands:\n/help - shows this message\n/players - list the players in the server\n/backup [force] [name] - makes a server backup (admin only)\n/start - starts the server (admin only)\n/stop - stops the server (admin only)\n/restart - restarts the server (admin only)\n/command <cmd> - sends a console command (admin only)\n/owoify <mode> - owoifies all messages\n/reinitialize - reinitializes log listener and RCON connection (admin only)",
      });
    }

    if (commandName === "players") {
      await interaction.deferReply({ flags: 64 });
      try {
        await sendConsoleCommandAPI("list");
        await new Promise(r => setTimeout(r, 1000));
        const stats = playerStatsManager("get");
        const listStr = stats.players.length > 0 ? stats.players.join(", ") : "None";
        await interaction.editReply({
          content: `There are ${stats.online}/${stats.max} players online` + (listStr !== "None" ? `:\n${listStr}` : ""),
        });
      } catch (err) {
        console.error("Players command error:", err);
        await interaction.editReply({
          content: "Failed to get player list.",
        });
      }
    }

    if (commandName === "backup") {
      if (!admins.includes(interaction.user.id)) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: "This command is admin only." });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      const force = interaction.options.getBoolean("force") || false;
      const name = interaction.options.getString("name");
      try {
        const listRes = await ptero(`/servers/${serverId}/backups`, "GET");
        const existing = listRes.data || [];
        console.log(`Existing backups: ${existing.length}`);
        if (existing.length >= 3) {
          if (!force) {
            return interaction.editReply({
              content: `Maximum number of backups reached (3). Use force option to delete the oldest and create a new one.`
            });
          }
          existing.sort((a, b) => new Date(a.attributes.created_at) - new Date(b.attributes.created_at));
          console.log("Deleting oldest backup:", existing[0]);
          const oldest = existing[0];
          if (oldest && oldest.attributes && oldest.attributes.uuid) {
            await ptero(`/servers/${serverId}/backups/${oldest.attributes.uuid}`, "DELETE");
          }
        }
        const backupName = name || "discord_backup";
        await ptero(`/servers/${serverId}/backups`, "POST", { name: backupName });
        await interaction.editReply({
          content: `Backup started! (force: ${force})`
        });
      } catch (err) {
        console.error("Backup command error:", err);
        await interaction.editReply({
          content: "Failed to handle backup command."
        });
      }
    }

    if (commandName === "start") {
      if (!admins.includes(interaction.user.id)) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: "This command is admin only." });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      await power("start");
      await interaction.editReply({
        content: "Server starting..."
      });
    }

    if (commandName === "stop") {
      if (!admins.includes(interaction.user.id)) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: "This command is admin only." });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      await power("stop");
      await interaction.editReply({
        content: "Server stopping..."
      });
    }

    if (commandName === "restart") {
      if (!admins.includes(interaction.user.id)) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: "This command is admin only." });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      await power("restart");
      await interaction.editReply({
        content: "Server restarting..."
      });
    }

    if (commandName === "reinitialize") {
      if (!admins.includes(interaction.user.id)) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: "This command is admin only." });
        return;
      }
      await interaction.deferReply({ flags: 64 });
      await reinitializeAll();
      await interaction.editReply({ content: "Reinitialized log listener and RCON connection." });
      return;
    }

    if (commandName === "owoify") {
      const mode = interaction.options.getString("mode");
      if (mode === "none" || mode === "uwu" || mode === "uvu" || mode === "owo") {
        owoState = mode;
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({
          content: `Owoify mode set to: ${mode}`
        });
      }
    }

    if (commandName === "command") {
      if (!admins.includes(interaction.user.id)) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: "This command is admin only." });
        return;
      }
      const cmd = interaction.options.getString("cmd");
      await interaction.deferReply({ flags: 64 });
      try {
        await sendConsoleCommandAPI(cmd);
        await interaction.editReply({
          content: `Command executed: ${cmd}`
        });
      } catch (err) {
        console.error("Command error:", err);
        await interaction.editReply({
          content: "Failed to execute command."
        });
      }
    }
  } catch (err) {
    console.error("Command error:", err);
    try {
      await interaction.editReply({
        content: "An error occurred while executing the command."
      });
    } catch (e) {
      // If editReply fails, ignore (already acknowledged)
    }
  }
});

// Discord message handler (for chat relay only)
client.on("messageCreate", async (message) => {
  if (message.channel.id !== chat_channel) return;
  if (message.author.bot) return;
  if (message.content.startsWith("/")) return; // Ignore slash commands

  let msg = message.content.trim();
  console.log(`Discord LOG [${message.member.nickname == null ? message.author.displayName : message.member.nickname}]: ${msg}`);
  
  if (owoState !== "none") {
    msg = owoify(msg, owoState);
  }
  
  const message_parts = splitToSubstrings(msg, "\n", 1024);
  const tellraw_parts = parseMessageParts(message, message_parts);
  tellraw_parts.forEach((tellraw) => {
    sendConsoleCommand(`tellraw @a ${JSON.stringify(tellraw)}`);
  });
});

client.login(token);