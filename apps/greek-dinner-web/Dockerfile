FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data && chown node:node /data
ENV DATABASE_FILE=/data/registrations.db
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
