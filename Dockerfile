FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.quotlyn-lock-hash
COPY . .
EXPOSE 5173 8787
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["npm", "run", "dev"]
