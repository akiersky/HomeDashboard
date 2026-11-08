# Family Dashboard without Home Assistant: the static dashboard plus server/ (see README, "Option 3").
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server server
COPY index.html styles.css ./
COPY js/bundle.js js/
COPY data/dashboard-data.json data/
RUN mkdir /data && chown node /data
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://localhost:${PORT}/healthz" >/dev/null || exit 1
CMD ["node", "server/index.js"]
