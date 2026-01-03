
import { useState, useEffect } from 'react';
import { IconButton, Badge, Menu, MenuItem, Typography, Box, List, ListItem, ListItemText, Divider, Popover, ListItemAvatar, Avatar } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { io } from 'socket.io-client';

dayjs.extend(relativeTime);

export default function NotificationBell({ darkMode }) {
    const [anchorEl, setAnchorEl] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [lastReadTime, setLastReadTime] = useState(null); // Track locally for UI highlighting

    // Fetch notifications when opening
    const handleOpen = (event) => {
        setAnchorEl(event.currentTarget);

        // Update local read time tracking
        const now = new Date();
        try {
            localStorage.setItem('notifications_last_read', now.toISOString());
            setLastReadTime(now); // New items will stop being "new" after this re-render cycle logic? 
            // Actually, we want them to appear new UNTIL we open it next time? 
            // Traditionally, opening the bell marks them as read.
            // So immediately upon opening, they might lose highlighting if we setLastReadTime(now).
            // Let's set it AFTER fetch or keep the OLD lastReadTime for rendering this view, then update it on close?
            // Simplified: Just clear unread count. We can keep highlighting based on 'notifications_last_read' stored BEFORE this open.
        } catch (e) { }

        if (unreadCount > 0) {
            setUnreadCount(0);
        }
        fetchNotifications();
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/notifications/history');
            if (res.data && Array.isArray(res.data.history)) {
                setNotifications(res.data.history);

                let storedLastRead = null;
                try {
                    const saved = localStorage.getItem('notifications_last_read');
                    if (saved) storedLastRead = new Date(saved);
                } catch (e) { }

                // Update state for rendering highlights
                setLastReadTime(storedLastRead);

                if (!storedLastRead) {
                    setUnreadCount(res.data.history.length);
                } else {
                    const count = res.data.history.filter(n => {
                        const t = n.timestamp ? new Date(n.timestamp) : null;
                        return t && t > storedLastRead;
                    }).length;
                    setUnreadCount(count);
                }
            }
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch on mount
    useEffect(() => {
        fetchNotifications();
    }, []);

    // Socket.IO Listener
    useEffect(() => {
        const socketUrl = import.meta.env.VITE_API_BASE || window.location.origin;
        console.log('[NotificationBell] Connecting to socket:', socketUrl);

        const socket = io(socketUrl, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('[NotificationBell] Socket connected');
        });

        socket.on('notification', (payload) => {
            console.log('[NotificationBell] Socket event received:', payload);

            // Instantly update UI (Optimistic / Parallel update)
            setNotifications(prev => {
                const updated = [payload, ...prev].slice(0, 10);
                return updated;
            });

            setUnreadCount(prev => prev + 1);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const open = Boolean(anchorEl);

    // Helper to determine icon and color
    const getNotificationStyles = (body) => {
        const text = (body || '').toLowerCase();
        if (text.includes('down')) {
            return { icon: <ArrowDownwardIcon fontSize="small" />, color: '#d32f2f', bgcolor: '#ffebee' }; // Red
        }
        if (text.includes('up') || text.includes('recovered')) {
            return { icon: <ArrowUpwardIcon fontSize="small" />, color: '#2e7d32', bgcolor: '#e8f5e9' }; // Green
        }
        return { icon: <NotificationsIcon fontSize="small" />, color: '#1976d2', bgcolor: '#e3f2fd' }; // Blue default
    };

    return (
        <>
            <IconButton
                color="inherit"
                onClick={handleOpen}
                sx={{
                    border: '1px solid',
                    borderColor: darkMode ? 'rgba(255,255,255,0.3)' : 'divider',
                    borderRadius: 1,
                    p: 0.75,
                    mr: 1
                }}
            >
                <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon fontSize="small" sx={{ color: darkMode ? '#f0f0f0' : 'inherit' }} />
                </Badge>
            </IconButton>

            <Popover
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
                    sx: { width: 360, maxHeight: 450, mt: 1.5, borderRadius: 2 }
                }}
            >
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="bold">Notifications</Typography>
                    {unreadCount > 0 && <Typography variant="caption" color="primary" fontWeight="bold">{unreadCount} New</Typography>}
                </Box>

                {loading && !notifications.length ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">Loading...</Typography></Box>
                ) : (
                    <List sx={{ p: 0 }}>
                        {notifications.length === 0 ? (
                            <ListItem><ListItemText primary="No recent notifications" /></ListItem>
                        ) : (
                            notifications.map((notif, index) => {
                                const styles = getNotificationStyles(notif.body);
                                const isNew = lastReadTime && notif.timestamp && new Date(notif.timestamp) > lastReadTime;

                                return (
                                    <Box key={index}>
                                        <ListItem
                                            alignItems="flex-start"
                                            sx={{
                                                px: 2,
                                                py: 2,
                                                bgcolor: isNew ? (darkMode ? 'rgba(255, 255, 255, 0.08)' : '#f0f7ff') : 'transparent',
                                                transition: 'background-color 0.2s',
                                                '&:hover': {
                                                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'
                                                }
                                            }}
                                        >
                                            <ListItemAvatar sx={{ minWidth: 40, mr: 1.5 }}>
                                                <Avatar sx={{ bgcolor: styles.bgcolor, color: styles.color, width: 32, height: 32 }}>
                                                    {styles.icon}
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={
                                                    <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600, lineHeight: 1.2, mb: 0.5 }}>
                                                        {notif.title}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <>
                                                        <Typography variant="body2" color="text.primary" sx={{ display: 'block', mb: 0.5, lineHeight: 1.4 }}>
                                                            {notif.body}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            {notif.timestamp ? `${dayjs(notif.timestamp).fromNow()} • ${dayjs(notif.timestamp).format('h:mm A')}` : ''}
                                                            {isNew && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main', display: 'inline-block', ml: 1 }} />}
                                                        </Typography>
                                                    </>
                                                }
                                                disableTypography
                                            />
                                        </ListItem>
                                        {index < notifications.length - 1 && <Divider component="li" variant="inset" sx={{ ml: 9 }} />}
                                    </Box>
                                );
                            })
                        )}
                    </List>
                )}
            </Popover>
        </>
    );
}
