FROM public.ecr.aws/docker/library/node:lts-slim

# Install app dependencies
RUN apt-get update && apt-get install -y 
RUN apt-get install git -y

RUN git clone https://github.com/garlico-in/electrum-http-wrapper.git /root/electrum-http-wrapper

WORKDIR /root/electrum-http-wrapper

COPY .env /root/electrum-http-wrapper/
COPY fullchain.pem /root/electrum-http-wrapper/
COPY privkey.pem /root/electrum-http-wrapper/

RUN npm install

EXPOSE 3000

ENTRYPOINT [ "node", "index.js" ]