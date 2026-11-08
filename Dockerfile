FROM oven/bun:1 AS base
WORKDIR /app

# Instala apenas dependências de produção.
FROM base AS production-deps
COPY package.json ./
RUN bun install --production

# Imagem final
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json ./
COPY index.ts ./
COPY src ./src
COPY scripts ./scripts
COPY database ./database

EXPOSE 3000/tcp
EXPOSE 5001/tcp

CMD ["sh", "-c", "bun run db:migrate && bun run start"]
