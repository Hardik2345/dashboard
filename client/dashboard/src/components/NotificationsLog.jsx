import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    List,
    ListItem,
    Divider,
    Avatar,
    Paper,
    CircularProgress,
    Stack,
    alpha,
    useMediaQuery,
    useTheme,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Bell,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    ChevronRight,
    Mail,
    ExternalLink,
    RefreshCw
} from 'lucide-react';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function NotificationsLog({ darkMode }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/push/notifications', { withCredentials: true });
            const data = res.data.notifications || [];
            setNotifications(data);
            if (data.length > 0 && !isMobile && !selectedId) {
                setSelectedId(data[0]._id);
            }
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const selectedNotif = notifications.find(n => n._id === selectedId);

    const renderEmpty = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 8, textAlign: 'center' }}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', mb: 2 }}>
                <Bell size={32} color={darkMode ? '#52525b' : '#a1a1aa'} />
            </Avatar>
            <Typography variant="h6" sx={{ color: darkMode ? '#fff' : '#111', mb: 1 }}>No Notifications Yet</Typography>
            <Typography variant="body2" color="text.secondary">All alerts triggered for your brands will appear here.</Typography>
        </Box>
    );

    if (loading && notifications.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress size={32} />
            </Box>
        );
    }

    if (notifications.length === 0) {
        return renderEmpty();
    }

    return (
        <Box sx={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2 }}>
            {/* Master List */}
            <Paper
                elevation={0}
                sx={{
                    flex: isMobile ? 'none' : '0 0 350px',
                    height: isMobile ? 'auto' : '100%',
                    maxHeight: isMobile ? '40vh' : 'none',
                    overflowY: 'auto',
                    borderRight: !isMobile ? '1px solid' : 'none',
                    borderBottom: isMobile ? '1px solid' : 'none',
                    borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    borderRadius: 3,
                    bgcolor: darkMode ? 'rgba(26, 26, 26, 0.4)' : 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(12px)',
                    position: 'relative'
                }}
            >
                <Box sx={{ p: 2, position: 'sticky', top: 0, bgcolor: 'inherit', zIndex: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Activity Log</Typography>
                    <IconButton size="small" onClick={fetchNotifications}>
                        <RefreshCw size={16} />
                    </IconButton>
                </Box>
                <List sx={{ p: 0 }}>
                    {notifications.map((notif, index) => {
                        const evt = notif.event || {};
                        const state = evt.current_state || 'ALERT';
                        const metric = (evt.metric || 'Metric').replace(/_/g, ' ');
                        const isAlert = state.includes('ALERT') || state.includes('TRIGGERED');
                        const isSelected = selectedId === notif._id;

                        return (
                            <div key={notif._id}>
                                <ListItem
                                    onClick={() => setSelectedId(notif._id)}
                                    sx={{
                                        cursor: 'pointer',
                                        py: 2,
                                        px: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 2,
                                        bgcolor: isSelected ? (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)') : 'transparent',
                                        '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.01)' },
                                        transition: 'all 0.2s',
                                        borderLeft: isSelected ? '4px solid' : '4px solid transparent',
                                        borderColor: 'primary.main'
                                    }}
                                >
                                    <Avatar sx={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '8px',
                                        bgcolor: isAlert ? alpha('#ef4444', 0.1) : alpha(theme.palette.primary.main, 0.1),
                                        color: isAlert ? '#ef4444' : theme.palette.primary.main
                                    }}>
                                        {isAlert ? <AlertCircle size={18} /> : <Bell size={18} />}
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle2" sx={{
                                            fontWeight: isSelected ? 700 : 500,
                                            fontSize: '0.85rem',
                                            color: darkMode ? '#fff' : '#111'
                                        }}>
                                            {state}: {metric}
                                        </Typography>
                                        <Typography variant="caption" color="text.disabled">
                                            {dayjs(notif.stored_at).fromNow()} • {evt.brand || 'All'}
                                        </Typography>
                                    </Box>
                                    <ChevronRight size={14} color={darkMode ? '#52525b' : '#a1a1aa'} />
                                </ListItem>
                                {index < notifications.length - 1 && <Divider sx={{ opacity: 0.5 }} />}
                            </div>
                        );
                    })}
                </List>
            </Paper>

            {/* Detail View */}
            <Paper
                elevation={0}
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 3,
                    bgcolor: darkMode ? 'rgba(26, 26, 26, 0.4)' : '#fff',
                    border: '1px solid',
                    borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    overflow: 'hidden'
                }}
            >
                {selectedNotif ? (
                    <>
                        {/* Detail Header */}
                        <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                                <Avatar sx={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: '12px',
                                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    color: theme.palette.primary.main
                                }}>
                                    <Mail size={24} />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                        {selectedNotif.event?.current_state || 'ALERT'}: {selectedNotif.event?.metric?.replace(/_/g, ' ') || 'Notification'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Received {dayjs(selectedNotif.stored_at).format('MMM D, YYYY [at] h:mm A')}
                                    </Typography>
                                </Box>
                            </Stack>

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                {[
                                    { label: 'Brand', value: selectedNotif.event?.brand },
                                    { label: 'Platform', value: selectedNotif.event?.platform },
                                    { label: 'Condition', value: selectedNotif.event?.condition },
                                    { label: 'Metric', value: selectedNotif.event?.metric }
                                ].filter(i => i.value).map((item, idx) => (
                                    <Box
                                        key={idx}
                                        sx={{
                                            px: 1.5,
                                            py: 0.5,
                                            borderRadius: '6px',
                                            bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            display: 'flex',
                                            gap: 1
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{item.label}:</Typography>
                                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{item.value}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        {/* Email Content Container */}
                        <Box sx={{ flex: 1, overflowY: 'auto', p: 0, bgcolor: '#fff' }}>
                            {(() => {
                                const emailContent = selectedNotif.email_body?.html ||
                                    selectedNotif.email_body ||
                                    selectedNotif.event?.email_body;

                                if (emailContent && typeof emailContent === 'string') {
                                    return (
                                        <Box sx={{ width: '100%', height: '100%', border: 'none' }}>
                                            <iframe
                                                title="Email Content"
                                                srcDoc={`
                                                    <!DOCTYPE html>
                                                    <html>
                                                        <head>
                                                            <style>
                                                                body { 
                                                                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                                                    margin: 20px;
                                                                    line-height: 1.6;
                                                                    color: #333;
                                                                }
                                                                table { width: 100% !important; max-width: 600px !important; margin: 0 auto; }
                                                            </style>
                                                        </head>
                                                        <body>
                                                            ${emailContent}
                                                        </body>
                                                    </html>
                                                `}
                                                style={{ width: '100%', height: '100%', border: 'none' }}
                                            />
                                        </Box>
                                    );
                                }

                                return (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4, textAlign: 'center' }}>
                                        <Typography variant="body1" color="text.secondary">No email payload available for this notification.</Typography>
                                        <Typography variant="body2" sx={{ mt: 1 }}>{selectedNotif.event?.condition || 'Alert condition met.'}</Typography>
                                    </Box>
                                );
                            })()}
                        </Box>

                        {/* Detail Footer */}
                        <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                            <Tooltip title="View JSON Payload">
                                <IconButton size="small" onClick={() => console.log(selectedNotif)}>
                                    <ExternalLink size={18} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4, color: 'text.secondary', textAlign: 'center' }}>
                        <Typography>Select a notification to view details</Typography>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}
