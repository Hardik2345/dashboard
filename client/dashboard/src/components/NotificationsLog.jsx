import { useState, useEffect } from "react";
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
  Tooltip,
} from "@mui/material";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronRight,
  Mail,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { doGet } from "../lib/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default function NotificationsLog({ darkMode }) {
  /* Hide panel UI as per user request */
  return null;

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await doGet("/push/notifications");
      if (res.error) throw new Error("API Error");
      const data = res.data.notifications || [];
      setNotifications(data);
      if (data.length > 0 && !isMobile && !selectedId) {
        setSelectedId(data[0]._id);
      }
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Handle cross-component notification selection (from Bell Menu)
  useEffect(() => {
    if (notifications.length > 0) {
      const pendingId = localStorage.getItem("selected_notification_id");
      if (pendingId) {
        setSelectedId(pendingId);
        localStorage.removeItem("selected_notification_id");

        // Scroll to the selected item if needed (optional enrichment)
        // const el = document.getElementById(`notif-${pendingId}`);
        // if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [notifications]);

  const selectedNotif = notifications.find((n) => n._id === selectedId);

  const renderEmpty = () => (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 8,
        textAlign: "center",
      }}
    >
      <Avatar
        sx={{
          width: 64,
          height: 64,
          bgcolor: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
          mb: 2,
        }}
      >
        <Bell size={32} color={darkMode ? "#52525b" : "#a1a1aa"} />
      </Avatar>
      <Typography
        variant="h6"
        sx={{ color: darkMode ? "#fff" : "#111", mb: 1 }}
      >
        No Notifications Yet
      </Typography>
      <Typography variant="body2" color="text.secondary">
        All alerts triggered for your brands will appear here.
      </Typography>
    </Box>
  );

  if (loading && notifications.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400,
        }}
      >
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (notifications.length === 0) {
    return renderEmpty();
  }

  /* return null; // Temporarily hidden as per user request */

  return (
    <Paper
      elevation={0}
      sx={{
        height: "calc(100vh - 180px)",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        borderRadius: 4,
        overflow: "hidden",
        ...glassStyles,
      }}
    >
      {/* Master List */}
      <Box
        sx={{
          flex: isMobile ? "none" : "0 0 320px",
          height: isMobile ? "auto" : "100%",
          maxHeight: isMobile ? "35vh" : "none",
          display: "flex",
          flexDirection: "column",
          borderRight: !isMobile ? "1px solid" : "none",
          borderBottom: isMobile ? "1px solid" : "none",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: "0.75rem",
              color: "text.secondary",
            }}
          >
            Activity Log
          </Typography>
          <IconButton size="small" onClick={fetchNotifications}>
            <RefreshCw size={14} />
          </IconButton>
        </Box>
        <List sx={{ p: 0, overflowY: "auto", flex: 1 }}>
          {notifications.map((notif, index) => {
            const evt = notif.event || {};
            const state = evt.current_state || "ALERT";
            const metric = (evt.metric || "Metric").replace(/_/g, " ");
            const isSelected = selectedId === notif._id;
            const brand = evt.brand || "System";

            // State-based icons and colors
            let StatusIcon = AlertCircle;
            let iconColor = "#ef4444"; // Red for Alert/Critical
            let bgColor = alpha("#ef4444", 0.1);

            if (state === "NORMAL") {
              StatusIcon = CheckCircle;
              iconColor = "#10b981"; // Green
              bgColor = alpha("#10b981", 0.1);
            } else if (state === "TRIGGERED") {
              StatusIcon = AlertCircle;
              iconColor = "#f59e0b"; // Yellow/Amber
              bgColor = alpha("#f59e0b", 0.1);
            } else if (state === "CRITICAL") {
              StatusIcon = XCircle;
              iconColor = "#ef4444"; // Red
              bgColor = alpha("#ef4444", 0.1);
            }

            return (
              <div key={notif._id} id={`notif-${notif._id}`}>
                <ListItem
                  onClick={() => setSelectedId(notif._id)}
                  sx={{
                    cursor: "pointer",
                    py: 1.5,
                    px: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    bgcolor: isSelected
                      ? darkMode
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.03)"
                      : "transparent",
                    "&:hover": {
                      bgcolor: darkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.02)",
                    },
                    transition: "all 0.2s ease",
                    borderLeft: isSelected
                      ? "4px solid"
                      : "4px solid transparent",
                    borderColor: theme.palette.primary.main,
                  }}
                >
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "8px",
                      bgcolor: bgColor,
                      color: iconColor,
                    }}
                  >
                    <StatusIcon size={18} />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 800,
                        fontSize: "0.8rem",
                        color: "text.primary",
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                        lineHeight: 1.2,
                        mb: 0.25,
                      }}
                    >
                      {brand}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontSize: "0.75rem",
                        display: "block",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {metric}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: "0.65rem", color: "text.disabled" }}
                    >
                      {dayjs(notif.stored_at).fromNow()}
                    </Typography>
                  </Box>
                  <ChevronRight
                    size={12}
                    color={darkMode ? "#52525b" : "#a1a1aa"}
                  />
                </ListItem>
                {index < notifications.length - 1 && (
                  <Divider sx={{ opacity: 0.3 }} />
                )}
              </div>
            );
          })}
        </List>
      </Box>

      {/* Detail View */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0, // Ensure flex child can shrink
          bgcolor: isMobile
            ? "transparent"
            : darkMode
              ? "rgba(0,0,0,0.1)"
              : "rgba(255,255,255,0.2)",
        }}
      >
        {selectedNotif ? (
          <>
            {/* Detail Header */}
            <Box
              sx={{
                p: { xs: 2, md: 3 },
                borderBottom: "1px solid",
                borderColor: "divider",
                background: darkMode
                  ? "linear-gradient(to bottom, rgba(255,255,255,0.02), transparent)"
                  : "linear-gradient(to bottom, rgba(0,0,0,0.01), transparent)",
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Avatar
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "12px",
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: theme.palette.primary.main,
                  }}
                >
                  <Mail size={22} />
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 800,
                      lineHeight: 1.2,
                      fontSize: { xs: "1rem", md: "1.1rem" },
                      mb: 0.25,
                    }}
                  >
                    {selectedNotif.event?.current_state || "ALERT"}:{" "}
                    {selectedNotif.event?.metric?.replace(/_/g, " ") ||
                      "Notification"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Received{" "}
                    {dayjs(selectedNotif.stored_at).format(
                      "MMM D, YYYY [at] h:mm A",
                    )}
                  </Typography>
                </Box>
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ mt: 1 }}
              >
                {[
                  { label: "BRAND", value: selectedNotif.event?.brand },
                  { label: "CONDITION", value: selectedNotif.event?.condition },
                  { label: "METRIC", value: selectedNotif.event?.metric },
                ]
                  .filter((i) => i.value)
                  .map((item, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: "6px",
                        bgcolor: darkMode
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(0,0,0,0.03)",
                        border: "1px solid",
                        borderColor: darkMode
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(0,0,0,0.05)",
                        display: "flex",
                        gap: 1,
                        alignItems: "center",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          color: "text.secondary",
                          fontSize: "0.65rem",
                        }}
                      >
                        {item.label}:
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, fontSize: "0.65rem" }}
                      >
                        {item.value}
                      </Typography>
                    </Box>
                  ))}
              </Stack>
            </Box>

            {/* Email Content Container */}
            <Box
              sx={{
                flex: 1,
                overflowY: "auto",
                px: { xs: 1, md: 3 },
                py: { xs: 2, md: 3 },
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  flex: 1,
                  minHeight: 400,
                  borderRadius: 3,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: darkMode ? "#121212" : "#ffffff",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)",
                }}
              >
                {(() => {
                  const emailContent =
                    selectedNotif.email_body?.html ||
                    selectedNotif.email_body ||
                    selectedNotif.event?.email_body;

                  if (emailContent && typeof emailContent === "string") {
                    return (
                      <iframe
                        title="Email Content"
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <style>
                                body { 
                                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                  margin: 30px;
                                  line-height: 1.6;
                                  color: ${darkMode ? "#e4e4e7" : "#333"};
                                  background-color: ${darkMode ? "#121212" : "#ffffff"};
                                }
                                table { width: 100% !important; max-width: 600px !important; margin: 0 auto; border-collapse: collapse; }
                                p, span, td { color: ${darkMode ? "#e4e4e7" : "#333"} !important; }
                              </style>
                            </head>
                            <body>
                              ${emailContent}
                            </body>
                          </html>
                        `}
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                        }}
                      />
                    );
                  }

                  return (
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        p: 4,
                        textAlign: "center",
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        No email payload available for this notification.
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ mt: 1, color: "text.disabled" }}
                      >
                        {selectedNotif.event?.condition ||
                          "Alert condition met."}
                      </Typography>
                    </Box>
                  );
                })()}
              </Paper>
            </Box>

            {/* Detail Footer */}
            <Box
              sx={{
                px: 3,
                py: 1.5,
                borderTop: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <Tooltip title="View raw payload in console">
                <IconButton
                  size="small"
                  onClick={() =>
                    console.log("Notification Payload:", selectedNotif)
                  }
                  sx={{
                    color: "text.disabled",
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  <ExternalLink size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              p: 4,
              color: "text.secondary",
              textAlign: "center",
            }}
          >
            <Bell
              size={48}
              strokeWidth={1}
              style={{ opacity: 0.2, marginBottom: 16 }}
            />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Select an activity from the log to view details
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
