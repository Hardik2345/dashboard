import { useState, useEffect, useRef } from 'react';
import { Badge, IconButton, Popover, Box, Typography, List, ListItem, CircularProgress, Divider, Avatar } from '@mui/material';
import { Bell, TrendingUp, TrendingDown, AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function NotificationsMenu({ darkMode }) {
    const [anchorEl, setAnchorEl] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const hasOpenedRef = useRef(false);

    const fetchNotifications = async () => {
        try {
            const res = await axios.get('/api/push/notifications', { withCredentials: true });
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.unreadCount || 0);
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        }
    };

    // Poll for new notifications
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 15000);

        const handleFcmEvent = () => fetchNotifications();
        window.addEventListener('fcm-foreground-message', handleFcmEvent);

        return () => {
            clearInterval(interval);
            window.removeEventListener('fcm-foreground-message', handleFcmEvent);
        };
    }, []);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
        hasOpenedRef.current = true;
        fetchNotifications();
    };

    const handleClose = () => {
        setAnchorEl(null);
        // Mark as read ONLY when the popover CLOSES, not when it opens
        if (hasOpenedRef.current) {
            markAsRead();
            hasOpenedRef.current = false;
        }
    };

    const markAsRead = async () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n._id);
        if (!unreadIds.length) return;

        try {
            await axios.put('/api/push/notifications/read', { message_ids: unreadIds }, { withCredentials: true });
            setUnreadCount(0);
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (error) {
            console.error('Failed to mark notifications as read', error);
        }
    };

    const open = Boolean(anchorEl);
    const id = open ? 'notifications-popover' : undefined;

    return (
        <>
            <IconButton
                onClick={handleClick}
                size="small"
                sx={{
                    bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderRadius: '10px',
                    p: 1.2,
                    color: darkMode ? 'zinc.400' : 'zinc.500',
                    '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }
                }}
            >
                <Badge badgeContent={unreadCount} color="error" sx={{ '& .MuiBadge-badge': { right: -3, top: 3 } }}>
                    <Bell size={20} />
                </Badge>
            </IconButton>
            <Popover
                id={id}
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                PaperProps={{
                    sx: {
                        width: 350,
                        maxHeight: 450,
                        mt: 1,
                        bgcolor: darkMode ? '#1e1e1e' : '#ffffff',
                        backgroundImage: 'none',
                        borderRadius: '12px',
                        boxShadow: darkMode
                            ? '0 10px 40px rgba(0,0,0,0.5)'
                            : '0 10px 40px rgba(0,0,0,0.1)',
                    }
                }}
            >
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700, color: darkMode ? '#fff' : '#111' }}>
                        Recent Alerts
                    </Typography>
                    {unreadCount > 0 && (
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, cursor: 'pointer' }} onClick={markAsRead}>
                            Mark all as read
                        </Typography>
                    )}
                </Box>
                <List sx={{ p: 0 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : notifications.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                                No notifications yet
                            </Typography>
                        </Box>
                    ) : (
                        notifications.map((notif, index) => {
                            const evt = notif.event || {};
                            const metricName = (evt.metric || 'Metric').replace(/_/g, ' ');
                            const delta = Math.abs(evt.delta_percent || 0).toFixed(2);
                            const direction = (evt.delta_percent || 0) < 0 ? 'Dropped' : 'Rose';
                            const state = evt.current_state || 'ALERT';
                            const brand = evt.brand || '';
                            const isAlert = state.includes('ALERT') || state.includes('TRIGGERED');
                            const isTrendUp = (evt.delta_percent || 0) > 0;
                            const isTrendDown = (evt.delta_percent || 0) < 0;

                            return (
                                <div key={notif._id || index}>
                                    <ListItem sx={{
                                        px: 2,
                                        py: 1.5,
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 2,
                                        bgcolor: notif.read ? 'transparent' : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                        '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                                        transition: 'background-color 0.2s'
                                    }}>
                                        <Avatar sx={{
                                            bgcolor: isAlert ? (darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)') : (darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                                            color: isAlert ? '#ef4444' : (darkMode ? '#a1a1aa' : '#71717a'),
                                            width: 40,
                                            height: 40,
                                            borderRadius: '10px'
                                        }}>
                                            {isAlert ? <AlertCircle size={20} /> : <Bell size={20} />}
                                        </Avatar>

                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="subtitle2" sx={{
                                                    fontWeight: notif.read ? 600 : 800,
                                                    color: darkMode ? '#fff' : '#111',
                                                    fontSize: '0.875rem',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {state}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.disabled', whiteSpace: 'nowrap', ml: 1 }}>
                                                    {notif.stored_at ? dayjs(notif.stored_at).fromNow() : ''}
                                                </Typography>
                                            </Box>

                                            <Typography variant="body2" sx={{
                                                color: darkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                                                lineHeight: 1.4,
                                                mb: 0.5
                                            }}>
                                                {metricName} {direction} by <Box component="span" sx={{ fontWeight: 700, color: isTrendDown ? '#ef4444' : '#10b981' }}>{delta}%</Box> | {brand}
                                            </Typography>

                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {isTrendUp ? (
                                                    <TrendingUp size={14} style={{ color: '#10b981' }} />
                                                ) : isTrendDown ? (
                                                    <TrendingDown size={14} style={{ color: '#ef4444' }} />
                                                ) : null}
                                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                                    {evt.condition || 'Value changed significantly.'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        {!notif.read && (
                                            <Box sx={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                bgcolor: 'primary.main',
                                                mt: 1
                                            }} />
                                        )}
                                    </ListItem>
                                    {index < notifications.length - 1 && <Divider sx={{ borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />}
                                </div>
                            );
                        })
                    )}
                </List>
            </Popover>
        </>
    );
}
