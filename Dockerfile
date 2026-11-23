FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    librsvg2-bin fonts-noto-core \
    && command -v rsvg-convert \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
