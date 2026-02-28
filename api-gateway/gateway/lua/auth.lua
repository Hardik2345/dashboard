local jwt = require("resty.jwt")
local jwks = require("jwks")
local cjson = require("cjson")
local hmac = require("resty.hmac")
local resty_str = require("resty.string")

local _M = {}

function _M.authenticate()
    -- 0. Check for Pipeline Key Bypass
    local pipeline_key = ngx.req.get_headers()["x-pipeline-key"]
    local secret_pipeline_key = os.getenv("X_PIPELINE_KEY")

    if pipeline_key and pipeline_key ~= "" and secret_pipeline_key and secret_pipeline_key ~= "" then
        if pipeline_key == secret_pipeline_key then
            -- Only allow bypass for resolve route
            if ngx.var.uri:find("^/tenant/resolve") then
                ngx.req.set_header("x-user-id", "pipeline-service")
                ngx.req.set_header("x-role", "system")
                return
            end
        end
    end


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
    local cache = ngx.shared.jwt_cache
    local cached_payload

    if cache then
        local cached_json = cache:get(token)
        if cached_json then
            local ok, decoded = pcall(cjson.decode, cached_json)
            if ok and decoded then
                cached_payload = decoded
                if decoded.exp and decoded.exp < ngx.time() then
                    cache:delete(token)
                    cached_payload = nil
                end
            end
        end
    end

    local claims
    if cached_payload then
        claims = cached_payload
    else
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
        claims = verified.payload
        if claims.exp and claims.exp < ngx.time() then
             ngx.status = 401
             ngx.say(cjson.encode({error = "token_expired"}))
             ngx.exit(401)
        end

        -- cache verified payload briefly
        if cache then
            local ttl = 300
            if claims.exp then
                local remaining = claims.exp - ngx.time()
                if remaining > 0 then
                    ttl = math.min(ttl, remaining)
                else
                    ttl = nil
                end
            end
            if ttl and ttl > 0 then
                cache:set(token, cjson.encode(claims), ttl)
            end
        end
    end

    -- 6. Resolve Brand Context
    local args = ngx.req.get_uri_args() or {}
    local requested_brand = args["brand_key"]
    local header_brand = ngx.req.get_headers()["x-brand-id"]
    local target_brand_id = nil

    if requested_brand and requested_brand ~= "" then
        target_brand_id = tostring(requested_brand):upper()
    elseif header_brand and header_brand ~= "" then
        target_brand_id = tostring(header_brand):upper()
    elseif claims.primary_brand_id then
        target_brand_id = tostring(claims.primary_brand_id):upper()
    end

    if not target_brand_id or target_brand_id == "" then
        ngx.status = 403
        ngx.say(cjson.encode({error = "No brand context determined"}))
        ngx.exit(403)
    end

    -- Validate Membership (authors/admins are global; viewers must have brand access)
    local role = claims.role
    local allowed = role == "author"
    if not allowed and claims.brand_ids then
        for _, b_id in ipairs(claims.brand_ids) do
            if tostring(b_id):upper() == target_brand_id then
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
    if not role then
         ngx.status = 403
         ngx.say(cjson.encode({error = "No role in token"}))
         ngx.exit(403)
    end

    -- Admin Route Protection (author is the elevated role)
    if ngx.var.uri:find("^/admin") then
        if role ~= "author" then
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
        local payload = table.concat({
            tostring(claims.sub or ""),
            tostring(target_brand_id or ""),
            tostring(role or ""),
            ts
        }, "|")
        local hm = hmac:new(gw_secret, hmac.ALGOS.SHA256)
        local sig = hm:final(payload, true) -- hex-encoded
        ngx.req.set_header("x-gw-ts", ts)
        ngx.req.set_header("x-gw-sig", sig)
    end

    ngx.req.clear_header("Authorization")
end

return _M
