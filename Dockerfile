# Minify client side assets (JavaScript)
FROM node:latest AS build-js

RUN npm install gulp gulp-cli -g

WORKDIR /build
COPY . .
RUN npm install --include=dev
RUN gulp


# Build Golang binary
FROM golang:1.24 AS build-golang

WORKDIR /go/src/github.com/gophish/gophish
COPY . .
RUN go get -v && go build -v


# Runtime container
FROM debian:stable-slim

RUN useradd -m -d /opt/gophish -s /bin/bash app

RUN apt-get update && \
	apt-get install --no-install-recommends -y jq libcap2-bin ca-certificates && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /opt/gophish
COPY --from=build-golang /go/src/github.com/gophish/gophish/ ./
COPY --from=build-js /build/static/js/dist/ ./static/js/dist/
COPY --from=build-js /build/static/css/dist/ ./static/css/dist/
COPY --from=build-golang /go/src/github.com/gophish/gophish/config.json ./
RUN chown app. config.json

RUN setcap 'cap_net_bind_service=+ep' /opt/gophish/gophish
RUN sed -i 's/\r$//' docker/run.sh
RUN mkdir -p /opt/gophish/data && chown app:app /opt/gophish/data
RUN openssl req -x509 -newkey rsa:2048 -nodes -keyout gophish_admin.key -out gophish_admin.crt -days 3650 -subj "/CN=localhost" && chown app:app gophish_admin.key gophish_admin.crt

USER app
RUN sed -i 's/127.0.0.1/0.0.0.0/g' config.json
RUN touch config.json.tmp
RUN chown app:app config.json.tmp

EXPOSE 3333 8080 8443 80

CMD ["sh", "./docker/run.sh"]
