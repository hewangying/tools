FROM node:18-slim
WORKDIR /app
COPY package.json server.js ./
RUN npm install --production
EXPOSE 80
CMD ["node", "server.js"]
