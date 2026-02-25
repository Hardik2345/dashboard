import { useState, useEffect, useCallback, useRef } from 'react';
import {
    IconButton, Badge, Popover, Box, Typography, Button, Divider,
    Chip, CircularProgress, useTheme
} from '@mui/material';
import { Bell, CheckCheck, AlertTriangle, TrendingDown, TrendingUp, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getNotifications, markNotificationsRead } from '../lib/api';

dayjs.extend(relativeTime);

const SEVERITY_COLORS = {
    critical: { bg: '#fee2e2', color: '#dc2626', label: 'Critical' },
    high: { bg: '#fef3c7', color: '#d97706', label: 'High' },
    medium: { bg: '#fff7ed', color: '#ea580c', label: 'Medium' },
    low: { bg: '#ecfdf5', color: '#059669', label: 'Low' },
    info: { bg: '#eff6ff', color: '#2563eb', label: 'Info' },
};

export default function NotificationBell({ darkMode = false }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [anchorEl, setAnchorEl] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const hasFetchedRef = useRef(false);

    const open = Boolean(anchorEl);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getNotifications(50);
            if (!res.error && res.data) {
                setNotifications(res.data.notifications || []);
                setUnreadCount(res.data.unread_count || 0);
            }
        } catch (e) {
            console.error('Failed to fetch notifications', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch on mount
    useEffect(() => {
        if (!hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchNotifications();
        }
    }, [fetchNotifications]);

    // Listen for real-time push events from the service worker
    useEffect(() => {
        const handler = () => fetchNotifications();
        window.addEventListener('new-push-notification', handler);
        return () => window.removeEventListener('new-push-notification', handler);
    }, [fetchNotifications]);

    const handleOpen = (e) => {
        setAnchorEl(e.currentTarget);
        fetchNotifications(); // refresh on open
    };

    const handleClose = () => setAnchorEl(null);

    const handleMarkAllRead = async () => {
        try {
            await markNotificationsRead([]); // empty = mark all
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (e) {
            console.error('Failed to mark as read', e);
        }
    };

    const buildHeadline = (evt) => {
        if (!evt) return 'Notification';
        const delta = Math.abs(evt.delta_percent || 0).toFixed(2);
        const direction = (evt.delta_percent || 0) < 0 ? 'Dropped' : 'Rose';
        const metric = (evt.metric || 'metric').replace(/_/g, ' ');
        const state = evt.current_state || 'ALERT';
        const brand = evt.brand || '';
        return `${state}: ${metric} ${direction} by ${delta}% | ${brand}`;
    };

    return (
        <>
            <IconButton
                onClick={handleOpen}
                size="small"
                sx={{
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderRadius: '10px',
                    p: 1.2,
                    color: isDark ? 'zinc.400' : 'zinc.500',
                    '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }
                }}
            >
                <Badge
                    badgeContent={unreadCount}
                    color="error"
                    max={99}
                    sx={{
                        '& .MuiBadge-badge': {
                            fontSize: 10,
                            height: 18,
                            minWidth: 18,
                            ...(unreadCount === 0 && { display: 'none' })
                        }
                    }}
                >
                    <Bell size={20} />
                </Badge>
            </IconButton>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                    paper: {
                        sx: {
                            width: 400,
                            maxHeight: 500,
                            borderRadius: '12px',
                            mt: 1,
                            bgcolor: isDark ? '#1e1e2e' : '#fff',
                            border: '1px solid',
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            boxShadow: isDark
                                ? '0 8px 32px rgba(0,0,0,0.5)'
                                : '0 8px 32px rgba(0,0,0,0.12)',
                        }
                    }
                }}
            >
                {/* Header */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2, py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: isDark ? '#fff' : '#111' }}>
                        Notifications
                        {unreadCount > 0 && (
                            <Chip
                                label={unreadCount}
                                size="small"
                                color="error"
                                sx={{ ml: 1, height: 20, fontSize: 11, fontWeight: 700 }}
                            />
                        )}
                    </Typography>
                    {unreadCount > 0 && (
                        <Button
                            size="small"
                            startIcon={<CheckCheck size={14} />}
                            onClick={handleMarkAllRead}
                            sx={{
                                textTransform: 'none',
                                fontSize: 12,
                                fontWeight: 600,
                                color: isDark ? '#8b9cf7' : '#4f46e5',
                            }}
                        >
                            Mark all read
                        </Button>
                    )}
                </Box>

                {/* Notification List */}
                <Box sx={{ overflowY: 'auto', maxHeight: 420 }}>
                    {loading && notifications.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : notifications.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Bell size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <Typography variant="body2" color="text.secondary">
                                No notifications yet
                            </Typography>
                        </Box>
                    ) : (
                        notifications.map((n, i) => {
                            const evt = n.event || {};
                            const sev = SEVERITY_COLORS[evt.severity] || SEVERITY_COLORS.info;
                            const isDown = (evt.delta_percent || 0) < 0;
                            const headline = buildHeadline(evt);
                            const timeAgo = n.stored_at ? dayjs(n.stored_at).fromNow() : '';

                            return (
                                <Box key={n._id || i}>
                                    <Box
                                        sx={{
                                            px: 2, py: 1.5,
                                            display: 'flex', gap: 1.5, alignItems: 'flex-start',
                                            bgcolor: n.read
                                                ? 'transparent'
                                                : (isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)'),
                                            '&:hover': {
                                                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                            },
                                            transition: 'background 0.15s',
                                        }}
                                    >
                                        {/* Icon */}
                                        <Box sx={{
                                            mt: 0.3,
                                            width: 32, height: 32,
                                            borderRadius: '8px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            bgcolor: isDark ? `${sev.color}22` : sev.bg,
                                            flexShrink: 0,
                                        }}>
                                            {isDown
                                                ? <TrendingDown size={16} color={sev.color} />
                                                : <TrendingUp size={16} color={sev.color} />
                                            }
                                        </Box>

                                        {/* Content */}
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: n.read ? 500 : 700,
                                                    color: isDark ? '#e2e8f0' : '#1e293b',
                                                    lineHeight: 1.4,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {headline}
                                            </Typography>

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                                <Chip
                                                    label={sev.label}
                                                    size="small"
                                                    sx={{
                                                        height: 18, fontSize: 10, fontWeight: 700,
                                                        bgcolor: isDark ? `${sev.color}22` : sev.bg,
                                                        color: sev.color,
                                                        border: 'none',
                                                    }}
                                                />
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                                    <Clock size={11} style={{ opacity: 0.5 }} />
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                                                        {timeAgo}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Box>

                                        {/* Unread indicator */}
                                        {!n.read && (
                                            <Box sx={{
                                                width: 8, height: 8, borderRadius: '50%',
                                                bgcolor: '#6366f1', mt: 0.8, flexShrink: 0,
                                            }} />
                                        )}
                                    </Box>
                                    {i < notifications.length - 1 && (
                                        <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }} />
                                    )}
                                </Box>
                            );
                        })
                    )}
                </Box>
            </Popover>
        </>
    );
}
