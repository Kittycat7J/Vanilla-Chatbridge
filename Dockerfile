# ----------------------------------
# Pterodactyl Core Dockerfile
# Environment: Node.js - Discord/Minecraft Chat Bridge
# Minimum Panel Version: 0.6.0
# ----------------------------------
FROM node:18-alpine

RUN apk add --no-cache --update curl ca-certificates openssl git bash tini \
    && adduser --disabled-password --home /home/container container

WORKDIR /home/container

# Copy application files
COPY --chown=container:container . .

# Install dependencies as root, then switch to container user
RUN npm install --production

USER container
ENV USER=container HOME=/home/container

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
