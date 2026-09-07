local http = require("resty.http")
local cjson = require("cjson")

local _M = {}

-- Point to auth service inside Docker network
local JWKS_URL = "http://auth-service:3001/auth/.well-known/jwks.json"

-- Base64URL Decode
local function base64url_decode(s)
    if not s then return nil end
    local r = s:gsub('-', '+'):gsub('_', '/')
    local pad = #r % 4
    if pad > 0 then
        r = r .. string.rep('=', 4 - pad)
    end
    return ngx.decode_base64(r)
end

-- ASN.1 Helpers
local function encode_length(len)
    if len < 128 then
        return string.char(len)
    else
        local parts = {}
        while len > 0 do
            table.insert(parts, 1, string.char(len % 256))
            len = math.floor(len / 256)
        end
        return string.char(128 + #parts) .. table.concat(parts)
    end
end

local function encode_integer(n)
    if string.byte(n, 1) > 127 then
        n = string.char(0) .. n
    end
    return string.char(0x02) .. encode_length(#n) .. n
end

local function encode_sequence(content)
    return string.char(0x30) .. encode_length(#content) .. content
end

local function encode_bit_string(content)
    return string.char(0x03) .. encode_length(#content + 1) .. string.char(0) .. content
end

-- JWK (n, e) to PEM Conversion
local function jwk_to_pem(n, e)
    if not n or not e then return nil end
    
    local mod = base64url_decode(n)
    local exp = base64url_decode(e)
    
    if not mod or not exp then return nil end

    -- PKCS#1 RSA Public Key (minimal for embedding)
    -- Sequence { Integer(n), Integer(e) }
    local rsa_key = encode_sequence(encode_integer(mod) .. encode_integer(exp))
    
    -- X.509 SubjectPublicKeyInfo
    -- Sequence {
    --   Sequence { OID rsaEncryption, Null },
    --   BitString { rsa_key }
    -- }
    
    -- OID rsaEncryption: 1.2.840.113549.1.1.1
    -- DER: 06 09 2a 86 48 86 f7 0d 01 01 01
    local rsa_oid = string.char(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01)
    local algorithm_id = encode_sequence(rsa_oid .. string.char(0x05, 0x00)) -- Sequence { OID, Null }
    
    local public_key_info = encode_sequence(algorithm_id .. encode_bit_string(rsa_key))
    
    local b64 = ngx.encode_base64(public_key_info)
    -- Insert newlines for PEM format (64 chars)
    local pem_body = b64:gsub("(.{64})", "%1\n")
    
    return "-----BEGIN PUBLIC KEY-----\n" .. pem_body .. "\n-----END PUBLIC KEY-----"
end


function _M.get_public_key(kid)
    local cache = ngx.shared.jwks_cache
    local pem = cache:get(kid)

    if pem then
        return pem
    end

    -- Miss: Fetch from Auth Service
    local lock, err = require("resty.lock"):new("jwks_cache")
    if not lock then
        ngx.log(ngx.ERR, "failed to create lock: ", err)
        return nil
    end

    local elapsed, err = lock:lock("fetch_jwks")
    if not elapsed then
        ngx.log(ngx.ERR, "failed to acquire lock: ", err)
        return nil
    end

    -- Check cache again after lock
    pem = cache:get(kid)
    if pem then
        lock:unlock()
        return pem
    end

    local httpc = http.new()
    local res, err = httpc:request_uri(JWKS_URL, {
        method = "GET",
        headers = {
            ["Accept"] = "application/json",
        }
    })

    if not res or res.status ~= 200 then
        ngx.log(ngx.ERR, "Failed to fetch JWKS: ", err or res.status)
        lock:unlock()
        return nil
    end

    local jwks = cjson.decode(res.body)
    if not jwks or not jwks.keys then
        lock:unlock()
        return nil
    end

    for _, key in ipairs(jwks.keys) do
        if key.kty == "RSA" and key.n and key.e then
             local new_pem = jwk_to_pem(key.n, key.e)
             if new_pem then
                 -- Cache PEM directly (Issue 2 Fix)
                 cache:set(key.kid, new_pem, 3600)
             end
        end
    end

    lock:unlock()

    return cache:get(kid)
end

return _M
