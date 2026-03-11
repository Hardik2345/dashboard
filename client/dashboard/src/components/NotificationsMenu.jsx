import { useState, useEffect, useRef } from "react";
import {
  Badge,
  IconButton,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  CircularProgress,
  Divider,
  Avatar,
  useTheme,
} from "@mui/material";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Target,
} from "lucide-react";
import { doGet, doPut } from "../lib/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default function NotificationsMenu({ darkMode, onTabChange }) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const hasOpenedRef = useRef(false);

  const fetchNotifications = async () => {
    try {
      const res = await doGet("/push/notifications");
      if (res.error) throw new Error("API Error");
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    }
  };

  // Poll for new notifications
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);

    const handleFcmEvent = () => fetchNotifications();
    window.addEventListener("fcm-foreground-message", handleFcmEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener("fcm-foreground-message", handleFcmEvent);
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
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n._id);
    if (!unreadIds.length) return;

    try {
      await doPut("/push/notifications/read", { message_ids: unreadIds });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error("Failed to mark notifications as read", error);
    }
  };

  const open = Boolean(anchorEl);
  const id = open ? "notifications-popover" : undefined;

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        sx={{
          bgcolor: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
          borderRadius: "10px",
          p: 1.2,
          color: darkMode ? "zinc.400" : "zinc.500",
          "&:hover": {
            bgcolor: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
          },
        }}
      >
        <Badge
          badgeContent={unreadCount}
          color="error"
          sx={{ "& .MuiBadge-badge": { right: -3, top: 3 } }}
        >
          <Bell size={20} />
        </Badge>
      </IconButton>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            width: 350,
            maxHeight: 450,
            mt: 1,
            bgcolor: "background.paper",
            backgroundImage: "none",
            borderRadius: "12px",
            boxShadow: theme.shadows[10],
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography
            variant="h6"
            sx={{ fontSize: "1rem", fontWeight: 700, color: "text.primary" }}
          >
            Recent Alerts
          </Typography>
          {unreadCount > 0 && (
            <Typography
              variant="caption"
              sx={{ color: "primary.main", fontWeight: 600, cursor: "pointer" }}
              onClick={markAsRead}
            >
              Mark all as read
            </Typography>
          )}
        </Box>
        <List sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                No notifications yet
              </Typography>
            </Box>
          ) : (
            notifications
              .filter((notif) => {
                // Hide performance alerts from the bell icon window
                // if (notif.event?.metric === "performance") return false;
                return notif.event?.metric !== "performance";
              })
              .slice(0, 5)
              .map((notif, index) => {
              const evt = notif.event || {};
              const metricName = (evt.metric || "Metric").replace(/_/g, " ");
              const delta = Math.abs(evt.delta_percent || 0).toFixed(2);
              const direction =
                (evt.delta_percent || 0) < 0 ? "Dropped" : "Rose";
              const state = evt.current_state || "ALERT";
              const brand = evt.brand || "System";

              // State-based icons and colors
              let StatusIcon = AlertCircle;
              let iconColor = "#ef4444"; // Red for Alert/Critical
              let bgColor = darkMode
                ? "rgba(239, 68, 68, 0.1)"
                : "rgba(239, 68, 68, 0.05)";

              if (state === "NORMAL") {
                StatusIcon = CheckCircle;
                iconColor = "#10b981"; // Green
                bgColor = darkMode
                  ? "rgba(16, 185, 129, 0.1)"
                  : "rgba(16, 185, 129, 0.05)";
              } else if (state === "TRIGGERED") {
                StatusIcon = AlertCircle;
                iconColor = "#f59e0b"; // Yellow/Amber
                bgColor = darkMode
                  ? "rgba(245, 158, 11, 0.1)"
                  : "rgba(245, 158, 11, 0.05)";
              } else if (state === "CRITICAL") {
                StatusIcon = XCircle;
                iconColor = "#ef4444"; // Red
                bgColor = darkMode
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(239, 68, 68, 0.05)";
              }

              const isTrendUp = (evt.delta_percent || 0) > 0;
              const isTrendDown = (evt.delta_percent || 0) < 0;

              const handleItemClick = () => {
                /* Navigation disabled while panel is hidden
                if (notif._id) {
                  localStorage.setItem("selected_notification_id", notif._id);
                }
                if (onTabChange) onTabChange("notifications-log");
                handleClose();
                */
              };

              return (
                <div key={notif._id || index}>
                  <ListItem
                    onClick={handleItemClick}
                    sx={{
                      px: 2,
                      py: 1.5,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 2,
                      bgcolor: notif.read
                        ? "transparent"
                        : darkMode
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(0,0,0,0.02)",
                      transition: "background-color 0.2s",
                    }}
                  >
                    <Avatar
                      sx={{
                        bgcolor: bgColor,
                        color: iconColor,
                        width: 40,
                        height: 40,
                        borderRadius: "10px",
                      }}
                    >
                      <StatusIcon size={20} />
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 800,
                            color: "text.primary",
                            fontSize: "0.85rem",
                            letterSpacing: "0.02em",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {brand}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.disabled",
                            whiteSpace: "nowrap",
                            ml: 1,
                          }}
                        >
                          {notif.stored_at
                            ? dayjs(notif.stored_at).fromNow()
                            : ""}
                        </Typography>
                      </Box>

                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          lineHeight: 1.4,
                          mb: 0.5,
                          fontSize: "0.825rem",
                        }}
                      >
                        {metricName} {direction} by{" "}
                        <Box
                          component="span"
                          sx={{
                            fontWeight: 700,
                            color: iconColor,
                          }}
                        >
                          {delta}%
                        </Box>{" "}
                        | current state:{" "}
                        <Box
                          component="span"
                          sx={{
                            fontWeight: 600,
                            color: iconColor,
                            fontSize: "0.75rem",
                          }}
                        >
                          {state}
                        </Box>
                      </Typography>

                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                      >
                        <Target size={12} style={{ color: iconColor }} />
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {evt.current_value !== undefined
                            ? `current value: ${Number(evt.current_value).toFixed(2)}`
                            : evt.condition || "Value changed significantly."}
                        </Typography>
                      </Box>
                    </Box>
                    {!notif.read && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          mt: 1,
                        }}
                      />
                    )}
                  </ListItem>
                  {index < 4 && index < notifications.length - 1 && <Divider />}
                </div>
              );
            })
          )}
        </List>
        {notifications.length > 5 && (
          <Box
            sx={{
              p: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
              textAlign: "center",
            }}
          >
            <Typography
              variant="button"
              sx={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "text.disabled",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Recent Notifications
            </Typography>
          </Box>
        )}
      </Popover>
    </>
  );
}
