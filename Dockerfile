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

USER container
ENV USER=container HOME=/home/container

CMD ["/bin/bash", "entrypoint.sh"]

