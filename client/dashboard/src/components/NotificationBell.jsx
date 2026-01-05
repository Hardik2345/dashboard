
import { useState, useEffect } from 'react';
import { IconButton, Badge, Menu, MenuItem, Typography, Box, List, ListItem, ListItemText, Divider, Popover, ListItemAvatar, Avatar, Tooltip } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import DoneAllIcon from '@mui/icons-material/DoneAll';
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
        // We only fetch, we don't clear unreads immediately to allow user to see "New" tags
        // But traditional bells often clear badge on open. 
        // Let's decide to clear Badge but keep List Highlights?
        // User asked for "Mark As Read" button.
        // So we might NOT clear unreadCount on open? 
        // Existing logic was: if (unreadCount > 0) setUnreadCount(0);
        // I will KEEP that for the badge (external), but internal highlights remain until "Mark All Read".
        // Actually user said "mark as read ... which will clear the unseen".
        // If I clear badge on open, then the button is redundant for the badge.
        // Let's make the Badge persist until "Mark Read"? OR clear badge on open but highlights stay?
        // Usually: Badge clears on Open. Highlights clear on specific action or timeout.
        // Let's stick to: Badge clears on Open. Button clears Highlight.

        if (unreadCount > 0) {
            setUnreadCount(0);
        }
        fetchNotifications();
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleMarkAllRead = () => {
        const now = new Date();
        setLastReadTime(now);
        setUnreadCount(0); // Ensure badge is 0
        localStorage.setItem('notifications_last_read', now.toISOString());
    };

    const handleRefresh = () => {
        fetchNotifications();
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

                // Note: We don't overwrite unreadCount if we want it to persist?
                // But handleOpen clears it.
                // If we receive new ones via socket, it increments.
                // If we fetch, we recalculate?
                if (!storedLastRead) {
                    // If never read, all are new
                    // setUnreadCount(res.data.history.length);
                } else {
                    const count = res.data.history.filter(n => {
                        const t = n.timestamp ? new Date(n.timestamp) : null;
                        return t && t > storedLastRead;
                    }).length;
                    // Only update unread count if we are NOT open?
                    // actually if we are open, we see them.
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold">Notifications</Typography>
                        {/* Show "New" count if we have local unread logic passing? 
                             Current logic clears unreadCount on open. So this might flicker or be 0.
                             If we want to show how many *were* new, we need another state.
                             For now, let's remove the "New" chip inside the popover if it's always 0.
                             Or check if unreadCount > 0 BEFORE we clear it? Too complex for now.
                             We'll rely on the highlights.
                         */}
                        {unreadCount > 0 && (
                            <Box sx={{ bgcolor: 'error.main', color: 'white', px: 0.8, py: 0.2, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold' }}>
                                {unreadCount} NEW
                            </Box>
                        )}
                    </Box>
                    <Box>
                        <Tooltip title="Mark all as read">
                            <IconButton size="small" onClick={handleMarkAllRead}>
                                <DoneAllIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Refresh">
                            <IconButton size="small" onClick={handleRefresh}>
                                <RefreshIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
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
