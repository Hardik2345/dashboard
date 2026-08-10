FROM openresty/openresty:alpine

WORKDIR /usr/local/openresty/nginx

RUN apk add --no-cache curl tar \
  && mkdir -p /tmp/lua-deps /usr/local/openresty/lualib/resty \
  && curl -fsSL https://github.com/cdbattags/lua-resty-jwt/archive/refs/tags/v0.3.2.tar.gz -o /tmp/lua-deps/lua-resty-jwt.tar.gz \
  && tar -xzf /tmp/lua-deps/lua-resty-jwt.tar.gz -C /tmp/lua-deps \
  && cp -R /tmp/lua-deps/lua-resty-jwt-0.3.2/lib/resty/. /usr/local/openresty/lualib/resty/ \
  && curl -fsSL https://github.com/ledgetech/lua-resty-http/archive/refs/tags/v0.17.2.tar.gz -o /tmp/lua-deps/lua-resty-http.tar.gz \
  && tar -xzf /tmp/lua-deps/lua-resty-http.tar.gz -C /tmp/lua-deps \
  && cp -R /tmp/lua-deps/lua-resty-http-0.17.2/lib/resty/. /usr/local/openresty/lualib/resty/ \
  && curl -fsSL https://github.com/openresty/lua-resty-string/archive/refs/tags/v0.16.tar.gz -o /tmp/lua-deps/lua-resty-string.tar.gz \
  && tar -xzf /tmp/lua-deps/lua-resty-string.tar.gz -C /tmp/lua-deps \
  && cp -R /tmp/lua-deps/lua-resty-string-0.16/lib/resty/. /usr/local/openresty/lualib/resty/ \
  && curl -fsSL https://github.com/jkeys089/lua-resty-hmac/archive/refs/tags/v0.06.tar.gz -o /tmp/lua-deps/lua-resty-hmac.tar.gz \
  && tar -xzf /tmp/lua-deps/lua-resty-hmac.tar.gz -C /tmp/lua-deps \
  && cp -R /tmp/lua-deps/lua-resty-hmac-0.06/lib/resty/. /usr/local/openresty/lualib/resty/ \
  && rm -rf /tmp/lua-deps

COPY gateway/nginx.conf conf/nginx.conf
COPY gateway/lua gateway/lua

EXPOSE 18080

CMD ["openresty", "-g", "daemon off;"]
