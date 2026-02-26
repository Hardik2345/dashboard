import { useState, useEffect, useRef } from 'react';
import { Badge, IconButton, Popover, Box, Typography, List, ListItem, CircularProgress, Divider } from '@mui/material';
import { Bell } from 'lucide-react';
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
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                        Recent Alerts
                    </Typography>
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
                            const title = `${state}: ${metricName} ${direction} by ${delta}% | ${brand}`;

                            return (
                                <div key={notif._id || index}>
                                    <ListItem sx={{
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        bgcolor: notif.read ? 'transparent' : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                    }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: notif.read ? 400 : 700, mb: 0.5 }}>
                                            {title}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                            {evt.condition || 'Alert condition met.'}
                                        </Typography>
                                        <Typography variant="caption" color="text.disabled">
                                            {notif.stored_at ? dayjs(notif.stored_at).fromNow() : ''}
                                        </Typography>
                                    </ListItem>
                                    {index < notifications.length - 1 && <Divider />}
                                </div>
                            );
                        })
                    )}
                </List>
            </Popover>
        </>
    );
}
