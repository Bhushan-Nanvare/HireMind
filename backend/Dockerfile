# Build: install everything, generate the Prisma client, compile TypeScript
FROM node:22-alpine AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL on Alpine
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
# node_modules is copied from the build stage so the Prisma CLI is available for "npm run migrate:deploy"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma
# Where uploads land when STORAGE_DRIVER=local. Mount a persistent volume, or use STORAGE_DRIVER=s3.
RUN mkdir -p uploads/resumes uploads/audio && chown -R node:node /app
USER node
EXPOSE 5000
# Run migrations as a release/pre-deploy step: npm run migrate:deploy
CMD ["node", "dist/server.js"]
