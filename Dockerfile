# FROM node:lts-alpine
FROM node:14-alpine


COPY package*.json /usr/src/app/
COPY *.js /usr/src/app/

ENV SL_IP_ADDRESS=
ENV SL_PORT=80
ENV SL_NAME=
ENV FEATURES_LOCATION=


WORKDIR /usr/src/app
RUN npm install

EXPOSE 3000 1444/udp

CMD ["node", "server.js"]