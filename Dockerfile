FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p storage/documents

EXPOSE 3000
CMD ["node", "server.js"]