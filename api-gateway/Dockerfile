FROM openresty/openresty:alpine

WORKDIR /usr/local/openresty/nginx

RUN apk add --no-cache perl curl \
  && /usr/local/openresty/bin/opm get SkyLothar/lua-resty-jwt \
  && /usr/local/openresty/bin/opm get ledgetech/lua-resty-http \
  && /usr/local/openresty/bin/opm get openresty/lua-resty-string

COPY gateway/nginx.conf conf/nginx.conf
COPY gateway/lua gateway/lua
COPY scripts/start-openresty.sh /usr/local/bin/start-openresty.sh
RUN chmod +x /usr/local/bin/start-openresty.sh

EXPOSE 18080

CMD ["/usr/local/bin/start-openresty.sh"]
