FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 ca-certificates curl ffmpeg librsvg2-bin fonts-noto-core \
    && curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
