# ----------------------------------
# Pterodactyl Core Dockerfile
# Environment: Node.js - Discord/Minecraft Chat Bridge
# Minimum Panel Version: 0.6.0
# ----------------------------------

FROM node:18-alpine

RUN apk add --no-cache --update curl bash python3 cairo-dev pixman-dev pango-dev pkgconfig build-base \
    && adduser --disabled-password --home /home/container container

WORKDIR /home/container
# Copy application files
RUN curl -O https://raw.githubusercontent.com/Kittycat7J/Vanilla-Chatbridge/refs/heads/main/entrypoint.sh \
    && curl -O https://raw.githubusercontent.com/Kittycat7J/Vanilla-Chatbridge/refs/heads/main/index.js \
    && curl -O https://raw.githubusercontent.com/Kittycat7J/Vanilla-Chatbridge/refs/heads/main/package.json \
    && curl -O https://raw.githubusercontent.com/Kittycat7J/Vanilla-Chatbridge/refs/heads/main/package-lock.json
# COPY ./entrypoint.sh /entrypoint.sh

# # Install dependencies as root, then switch to container user
RUN npm install --omit=dev

USER container
ENV USER=container HOME=/home/container

CMD ["/bin/bash", "entrypoint.sh"]

