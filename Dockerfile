# xcadence — production image
#
# The market clock is a setInterval inside a long-lived Node process and the
# state lives in a SQLite file, so this needs a real container with a writable
# disk. It will not run on a serverless platform: functions freeze between
# requests, which stops the clock, and their filesystems are ephemeral, which
# loses the run.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/data/xcadence.db"
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/data/xcadence.db"
# The real roster: 253 named artists with photographs, biographies and
# catalogues from Wikipedia and MusicBrainz. Every page carries a disclosure
# stating which fields are genuine and that all market data is generated.
# Set to "demo" for generated names and no outbound requests at all.
ENV ROSTER_MODE=real

RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma needs the schema and migrations at runtime to create the database.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

USER app
VOLUME /data
EXPOSE 3000

# Apply migrations to the mounted volume, then start. The engine boots with the
# server and seeds a universe on first run.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
