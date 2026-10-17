FROM node:22-alpine

WORKDIR /app

# No hay dependencias externas: solo se copia el código
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Usuario sin privilegios (la imagen de node ya trae el usuario "node")
USER node

CMD ["node", "server.js"]
