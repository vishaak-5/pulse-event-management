# Production image for the Express API (Render runs this).
FROM node:22-alpine

# tzdata: event times are India wall-clock times (TZ below).
RUN apk add --no-cache tzdata
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Kolkata

# Dependencies first so this layer is cached between deploys.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
