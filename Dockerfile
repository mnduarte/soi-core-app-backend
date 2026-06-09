# syntax=docker/dockerfile:1.6

# ---------- Builder ----------
# Compile TypeScript, install all deps (including argon2's native bindings),
# then prune dev deps so the runtime stage stays slim.
FROM node:20-alpine AS builder

# argon2 builds a native addon; alpine needs python + a C++ toolchain.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build \
 && npm prune --omit=dev


# ---------- Runtime ----------
# Just node + the pruned production dependencies + the compiled dist.
FROM node:20-alpine AS runtime

# tini = proper PID 1 so SIGTERM from Fly actually reaches Node.
RUN apk add --no-cache tini

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
