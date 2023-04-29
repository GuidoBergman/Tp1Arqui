FROM node:18
RUN mkdir /opt/app
WORKDIR /opt/app
COPY app.js package.json package-lock.json ./
RUN npm install
EXPOSE 3000
ENTRYPOINT ["node", "app.js"]
