# Build context: platform/control-plane/api (standalone install)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json .
COPY vitest.config.ts .
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json .
EXPOSE 4000
CMD ["node", "dist/server.js"]
