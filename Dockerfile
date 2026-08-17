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
# Next's standalone server binds to $HOSTNAME. Railway sets that to the
# container id, which is not a bindable address — the process starts, listens
# on nothing, and the edge returns 502. Pin it.
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/xcadence.db"

# The real roster: 253 named artists with photographs, biographies and
# catalogues from Wikipedia and MusicBrainz. Every page carries a disclosure
# stating which fields are genuine and that all market data is generated.
# Set to "demo" for generated names and no outbound requests at all.
ENV ROSTER_MODE=real

# su-exec lets the entrypoint fix ownership of the mounted volume as root and
# then drop to an unprivileged user for the process itself.
RUN apk add --no-cache su-exec \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /data && chown app:app /data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# The Prisma CLI gets its own tree with the complete dependency graph. Copying
# just the prisma packages into the standalone bundle looked tidier and failed
# at runtime with MODULE_NOT_FOUND: standalone ships a minimal node_modules and
# does not carry the CLI's transitive dependencies.
COPY --from=deps /app/node_modules /migrator/node_modules
COPY --from=builder /app/prisma /migrator/prisma
# The generated client, which the server itself needs.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# No VOLUME instruction: Railway rejects it and manages the mount itself. For a
# plain `docker run`, pass -v to get the same persistence.
#
# Starts as root only long enough to take ownership of the mounted volume — a
# managed mount arrives root-owned and Prisma cannot create the database in a
# directory it cannot write — then drops to `app` for migrations and the server.
CMD ["sh", "-c", "chown -R app:app /data && exec su-exec app sh -c 'cd /migrator && node node_modules/prisma/build/index.js migrate deploy && cd /app && node server.js'"]
