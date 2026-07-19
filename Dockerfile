# 42 — Command Center (all-in-one image: Next.js standalone + game engine)
FROM node:20-slim AS build
WORKDIR /app

# Install root deps (dev included — the build needs typescript/tailwind/prisma)
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# Install engine deps (own package.json with socket.io)
COPY mini-services/game-engine/package.json mini-services/game-engine/package.json
RUN cd mini-services/game-engine && npm install --no-audit --no-fund

# App source + build
COPY . .
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server is self-contained, but the engine runs from source
# via tsx, so we ship the full workspace with dev deps pruned by NODE_ENV.
COPY --from=build /app /app

EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
