# Maitre — imagen de producción. Node 24 trae node:sqlite; no hay build del front.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY docs ./docs
# La base de datos y las imágenes viven en un volumen montado en /data
ENV MAITRE_DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
