FROM node:lts-alpine

COPY package*.json /usr/src/app/
COPY server.js /usr/src/app/

WORKDIR /usr/src/app
RUN npm install

EXPOSE 3000 80/udp

CMD ["node", "server.js"]