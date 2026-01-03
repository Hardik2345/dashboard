local jwt = require("resty.jwt")
local jwks = require("jwks")
local cjson = require("cjson")
local hmac = require("resty.hmac")
local resty_str = require("resty.string")

local _M = {}

function _M.authenticate()
    -- 1. Extract Bearer Token
    local auth_header = ngx.req.get_headers()["Authorization"]
    if not auth_header then
        ngx.status = 401
        ngx.say(cjson.encode({error = "Missing Authorization header"}))
        ngx.exit(401)
    end

    local token = string.match(auth_header, "Bearer%s+(.+)")
    if not token then
        ngx.status = 401
        ngx.say(cjson.encode({error = "Invalid Authorization header format"}))
        ngx.exit(401)
    end

    -- 2. Decode Header to find 'kid' (without verification first)
    local jwt_obj = jwt:load_jwt(token)
    if not jwt_obj or not jwt_obj.header or not jwt_obj.header.kid then
        ngx.status = 401
        ngx.say(cjson.encode({error = "Invalid JWT structure / Missing kid"}))
        ngx.exit(401)
    end

    local kid = jwt_obj.header.kid

    -- 3. Fetch Public Key (Expects valid PEM) (Issue 3 Fix)
    local pem_key = jwks.get_public_key(kid)
    if not pem_key then
        ngx.status = 401
        ngx.say(cjson.encode({error = "Unknown or Invalid Key ID"}))
        ngx.exit(401)
    end
    
    -- 4. Verify Signature (RS256)
    -- Verify using the PEM string directly (Issue 1 Verification)
    local verified = jwt:verify(pem_key, token)
    
    if not verified.verified then
         ngx.status = 401
         ngx.say(cjson.encode({error = "Invalid Signature: " .. (verified.reason or "unknown")}))
         ngx.exit(401)
    end

    -- 5. Verify Expiry
    local claims = verified.payload
    if claims.exp and claims.exp < ngx.time() then
         ngx.status = 401
         ngx.say(cjson.encode({error = "token_expired"}))
         ngx.exit(401)
    end

    -- 6. Resolve Brand Context
    local target_brand_id = ngx.req.get_headers()["x-brand-id"]
    if not target_brand_id then
        target_brand_id = claims.primary_brand_id
    end

    if not target_brand_id then
        ngx.status = 403
        ngx.say(cjson.encode({error = "No brand context determined"}))
        ngx.exit(403)
    end

    -- Validate Membership
    local allowed = false
    if claims.brand_ids then
        for _, b_id in ipairs(claims.brand_ids) do
            if b_id == target_brand_id then
                allowed = true
                break
            end
        end
    end

    if not allowed then
        ngx.status = 403
        ngx.say(cjson.encode({error = "Access denied to this brand"}))
        ngx.exit(403)
    end

    -- 7. Role Check (Coarse)
    local role = claims.roles and claims.roles[target_brand_id]
    if not role then
         ngx.status = 403
         ngx.say(cjson.encode({error = "No role in this brand"}))
         ngx.exit(403)
    end

    -- Admin Route Protection
    if ngx.var.uri:find("^/admin") then
        if role ~= "owner" and role ~= "admin" then
            ngx.status = 403
            ngx.say(cjson.encode({error = "Admin access required"}))
            ngx.exit(403)
        end
    end

    -- 8. Inject Trusted Headers
    ngx.req.set_header("x-user-id", claims.sub)
    ngx.req.set_header("x-brand-id", target_brand_id)
    ngx.req.set_header("x-role", role)
    if claims.email then
        ngx.req.set_header("x-email", claims.email)
    end

    -- 9. Gateway-signed header to prevent spoofing downstream
    local gw_secret = os.getenv("GATEWAY_SHARED_SECRET")
    if gw_secret and gw_secret ~= "" then
        local ts = tostring(ngx.time())
        local payload = table.concat({ claims.sub or "", target_brand_id or "", role or "", ts }, "|")
        local hm = hmac:new(gw_secret, hmac.ALGOS.SHA256)
        local sig = hm:final(payload, true) -- hex-encoded
        ngx.req.set_header("x-gw-ts", ts)
        ngx.req.set_header("x-gw-sig", sig)
    end

    ngx.req.clear_header("Authorization")
end

return _M
