#!/bin/bash
cd /home/container

# Output Node version
node --version

# Create config from environment variables or use existing config.json
curl -O https://github.com/Kittycat7J/Vanilla-Chatbridge/raw/refs/heads/main/index.js
curl -O https://github.com/Kittycat7J/Vanilla-Chatbridge/raw/refs/heads/main/entrypoint.sh
curl -O https://github.com/Kittycat7J/Vanilla-Chatbridge/raw/refs/heads/main/package.json
curl -O https://github.com/Kittycat7J/Vanilla-Chatbridge/raw/refs/heads/main/package-lock.json

# Replace Startup Variables
MODIFIED_STARTUP=`eval echo $(echo ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')`
echo ":/home/container$ ${MODIFIED_STARTUP}"

# Run the Application
${MODIFIED_STARTUP}
# node index.js
