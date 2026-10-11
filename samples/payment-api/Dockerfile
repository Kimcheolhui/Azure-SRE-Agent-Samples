FROM node:22-bookworm-slim
ARG SOURCE_COMMIT
ENV NODE_ENV=production PORT=8080 SOURCE_COMMIT=${SOURCE_COMMIT}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
