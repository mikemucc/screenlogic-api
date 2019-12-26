FROM node:lts-alpine

COPY package*.json /usr/src/app/
COPY *.js /usr/src/app/

WORKDIR /usr/src/app
RUN npm install

EXPOSE 3000 1444/udp

CMD ["node", "server.js"]