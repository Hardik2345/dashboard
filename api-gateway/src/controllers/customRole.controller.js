const CustomRoleService = require('../services/customRole.service');
const TokenService = require('../services/token.service');
const logger = require('../utils/logger');
const { isElevatedRole } = require('../services/rbac.service');

function requireAdminOrAuthor(req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('unauthorized');
    const payload = TokenService.verifyAccessToken(token);
    if (!payload || !isElevatedRole(payload.role)) {
        throw new Error('forbidden');
    }
    return payload;
}

function handleError(res, err, fallbackMessage) {
    if (err.message === 'unauthorized') return res.status(401).json({ error: 'Unauthorized' });
    if (err.message === 'forbidden') return res.status(403).json({ error: 'Forbidden' });
    if (err.message === 'role name required') return res.status(400).json({ error: err.message });
    if (err.message === 'duplicate role name') return res.status(409).json({ error: err.message });
    if (err.message === 'role not found') return res.status(404).json({ error: err.message });
    if (err.message === 'role in use') {
        return res.status(409).json({ error: err.message, assigned_user_count: err.assigned_user_count || 0 });
    }
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    logger.error('CustomRoleController', fallbackMessage, { error: err.message });
    return res.status(500).json({ error: fallbackMessage });
}

exports.listCustomRoles = async (req, res) => {
    try {
        requireAdminOrAuthor(req);
        const roles = await CustomRoleService.listRoles();
        return res.status(200).json({ roles });
    } catch (err) {
        return handleError(res, err, 'Failed to list custom roles');
    }
};

exports.getCustomRole = async (req, res) => {
    try {
        requireAdminOrAuthor(req);
        const role = await CustomRoleService.getRole(req.params.id);
        if (!role) return res.status(404).json({ error: 'role not found' });
        return res.status(200).json({ role });
    } catch (err) {
        return handleError(res, err, 'Failed to fetch custom role');
    }
};

exports.createCustomRole = async (req, res) => {
    try {
        const payload = requireAdminOrAuthor(req);
        const { name, description, permissions } = req.body || {};
        const role = await CustomRoleService.createRole({
            name,
            description,
            permissions,
            created_by: payload.email || '',
        });
        return res.status(201).json({ role });
    } catch (err) {
        return handleError(res, err, 'Failed to create custom role');
    }
};

exports.updateCustomRole = async (req, res) => {
    try {
        requireAdminOrAuthor(req);
        const { name, description, permissions } = req.body || {};
        const role = await CustomRoleService.updateRole(req.params.id, { name, description, permissions });
        return res.status(200).json({ role });
    } catch (err) {
        return handleError(res, err, 'Failed to update custom role');
    }
};

exports.deleteCustomRole = async (req, res) => {
    try {
        requireAdminOrAuthor(req);
        await CustomRoleService.deleteRole(req.params.id);
        return res.status(200).json({ ok: true });
    } catch (err) {
        return handleError(res, err, 'Failed to delete custom role');
    }
};
