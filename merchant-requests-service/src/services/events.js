const MerchantRequestEvent = require("../models/MerchantRequestEvent");

function actorFromPrincipal(principal = {}) {
  return {
    user_id: principal.user_id || "",
    email: principal.email || "",
    name: principal.name || "",
    role: principal.role || "",
  };
}

async function appendEvent(request, type, source, options = {}) {
  return MerchantRequestEvent.create({
    request_id: request._id,
    brand_key: request.brand_key,
    type,
    source,
    actor: options.actor || actorFromPrincipal(options.principal),
    message: options.message || "",
    data: options.data || {},
    todoist_comment_id: options.todoist_comment_id || "",
    local_comment_id: options.local_comment_id || "",
  });
}

module.exports = {
  actorFromPrincipal,
  appendEvent,
};
