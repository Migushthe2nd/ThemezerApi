FROM node:12 AS build-env

# Install sarctool
WORKDIR /tools
RUN apt-get update
RUN apt-get install -y python pip git
RUN pip install SarcLib==0.3 libyaz0==0.5
RUN git clone https://github.com/aboood40091/SARC-Tool

# build app
WORKDIR /usr/src/app

# Environment variables for production
ENV NODE_ENV=production

COPY package*.json ./
COPY yarn*.lock ./
RUN yarn install --network-timeout 1000000

COPY . .

RUN yarn run build

# Prune the dev dependencies
RUN yarn install --production --network-timeout 1000000

CMD yarn run start