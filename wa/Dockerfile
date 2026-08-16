FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.js ./
EXPOSE 3001
CMD ["node", "index.js"]
