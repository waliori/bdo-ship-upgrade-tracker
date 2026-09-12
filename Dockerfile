# A static site with a small Node server in front of it. The layers are
# ordered by how often they change: dependencies almost never, the game
# assets rarely, the code often -- so an ordinary code change rebuilds
# only the last few layers instead of re-copying half a gigabyte of
# icons and tiles.
FROM node:22-alpine

# Non-root, named for what it runs.
RUN addgroup -g 1001 -S nodejs && adduser -S tracker -u 1001 -G nodejs

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# The heavy, rarely-changing assets first.
COPY icons ./icons
COPY map ./map
# The terrain the chart stands up on. Sixty megabytes of tiles that
# change only when the bake is rerun against a patched client, so it
# sits up here with the rest of the ballast rather than beside the code.
COPY map3d ./map3d
COPY guide ./guide
# The vendored OCR engine: large, and it changes only when a version does.
COPY reader ./reader
# Only the walkthrough films: .dockerignore filters the README's stills
# and GIFs out of this copy, since nothing serves them.
COPY docs/media ./docs/media

# Then the code, which is what actually changes between builds.
COPY icon.png icon-192.png icon-512.png og.png icon_mapping.json manifest.webmanifest sw.js index.html server.js ./
COPY css ./css
COPY js ./js
COPY server ./server

# Stamp the deploy into the service worker: the offline cache is named
# for the build it holds, so activate can sweep every other deploy's.
# The server reads this stamp back at boot and serves it (server.js);
# APP_VERSION in the environment takes precedence over it.
RUN sed -i "s/__BUILD__/$(date -u +%Y%m%d%H%M%S)/" sw.js

# Where a local libSQL file lives when the deployment has no Turso, as
# TURSO_DATABASE_URL=file:./.data/tracker.db asks for. Made here, owned
# by the user that runs the server: /app itself belongs to root, so the
# process could not create it at run time and the open failed with
# SQLITE_CANTOPEN. docker-compose.yml holds a volume over this path, so
# the file survives a rebuild -- a database that a `--build` deletes is
# not a database.
RUN mkdir -p /app/.data && chown tracker:nodejs /app/.data

USER tracker

EXPOSE 8000

ENV NODE_ENV=production

# /healthz answers 503 when a configured database is not reachable, so
# the container reads unhealthy for a sync outage and not only for a
# process that is gone.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start node directly, not through npm. The server flushes every unsaved
# account to the database when SIGTERM arrives (see server/saves.js), and
# npm as PID 1 relays signals unreliably -- a `docker stop` could kill
# the process without the flush ever running, losing the last seconds of
# work the in-memory design exists to protect.
CMD ["node", "server.js"]
