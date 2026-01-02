import { useState, useEffect } from 'react';
import { IconButton, Badge, Menu, MenuItem, Typography, Box, List, ListItem, ListItemText, Divider, Popover } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function NotificationBell({ darkMode }) {
    const [anchorEl, setAnchorEl] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);

    const [unreadCount, setUnreadCount] = useState(0);

    // Fetch notifications when opening
    const handleOpen = (event) => {
        setAnchorEl(event.currentTarget);
        // Mark all as read when opening
        if (unreadCount > 0) {
            setUnreadCount(0);
            try {
                localStorage.setItem('notifications_last_read', new Date().toISOString());
            } catch (e) {
                // Ignore storage error
            }
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

                // Calculate unread count based on last saved read time
                let lastRead = null;
                try {
                    const saved = localStorage.getItem('notifications_last_read');
                    if (saved) lastRead = new Date(saved);
                } catch (e) { }

                if (!lastRead) {
                    // First time? Mark all as unread? Or maybe just new ones?
                    // User says "number of new notification".
                    // If never read, all 10 are new.
                    setUnreadCount(res.data.history.length);
                } else {
                    const count = res.data.history.filter(n => {
                        const t = n.timestamp ? new Date(n.timestamp) : null;
                        return t && t > lastRead;
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

    const open = Boolean(anchorEl);

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
                    sx: { width: 320, maxHeight: 400, mt: 1.5 }
                }}
            >
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="subtitle1" fontWeight="bold">Recent Notifications</Typography>
                </Box>

                {loading && !notifications.length ? (
                    <Box sx={{ p: 2 }}><Typography variant="body2">Loading...</Typography></Box>
                ) : (
                    <List sx={{ p: 0 }}>
                        {notifications.length === 0 ? (
                            <ListItem><ListItemText primary="No recent notifications" /></ListItem>
                        ) : (
                            notifications.map((notif, index) => (
                                <Box key={index}>
                                    <ListItem alignItems="flex-start" sx={{ px: 2, py: 1.5 }}>
                                        <ListItemText
                                            primary={
                                                <Typography variant="subtitle2" component="span" display="block">
                                                    {notif.title}
                                                </Typography>
                                            }
                                            secondary={
                                                <>
                                                    <Typography variant="body2" color="text.primary" display="block" sx={{ my: 0.5 }}>
                                                        {notif.body}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {notif.timestamp ? dayjs(notif.timestamp).fromNow() : ''}
                                                    </Typography>
                                                </>
                                            }
                                        />
                                    </ListItem>
                                    {index < notifications.length - 1 && <Divider component="li" />}
                                </Box>
                            ))
                        )}
                    </List>
                )}
            </Popover>
        </>
    );
}
