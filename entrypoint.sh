#!/bin/bash
cd /home/container

# Output Node version
node --version

# Create config from environment variables or use existing config.json


# Replace Startup Variables
MODIFIED_STARTUP=`eval echo $(echo ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')`
echo ":/home/container$ ${MODIFIED_STARTUP}"

# Run the Application
${MODIFIED_STARTUP}
# node index.js
