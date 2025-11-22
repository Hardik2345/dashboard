function heartbeat(requireAuthMiddleware, sessionTrackingEnabled, recordSessionActivity) {
  return [
    requireAuthMiddleware,
    async (req, res) => {
      if (!sessionTrackingEnabled) return res.status(204).end();
      const user = req.user || {};
      if (user.isAuthor || !user.brandKey) return res.status(204).end();

      const bodyMeta = req.body && typeof req.body === 'object' ? req.body.meta : null;
      const meta = { source: 'heartbeat' };
      if (bodyMeta && typeof bodyMeta === 'object') {
        if (typeof bodyMeta.visibility === 'string') meta.visibility = bodyMeta.visibility.slice(0, 16);
        if (typeof bodyMeta.path === 'string') meta.path = bodyMeta.path.slice(0, 180);
        if (typeof bodyMeta.idleMs === 'number' && Number.isFinite(bodyMeta.idleMs)) meta.idleMs = Math.max(0, Math.round(bodyMeta.idleMs));
        if (typeof bodyMeta.trigger === 'string') meta.trigger = bodyMeta.trigger.slice(0, 32);
      }

      try {
        await recordSessionActivity({
          brandKey: user.brandKey,
          email: user.email,
          userAgent: req.get('user-agent'),
          ip: req.ip,
          meta,
        });
      } catch (err) {
        console.warn('Session heartbeat tracking failed', err?.message || err);
      }

      return res.status(204).end();
    }
  ];
}

module.exports = { heartbeat };
