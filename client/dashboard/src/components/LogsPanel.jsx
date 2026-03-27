import React from "react";
import { Card, CardContent, Typography, Box, Stack, Divider } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";


export default function LogsPanel({ logs = [] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const dummyLogs = [
    { id: 1, timestamp: new Date().toISOString(), message: "System initialized.", type: "info" },
    { id: 2, timestamp: new Date().toISOString(), message: "Waiting for tenant configuration...", type: "warning" },
  ];

  const displayLogs = logs.length > 0 ? logs : dummyLogs;

  const cardStyle = {
    borderRadius: "16px",
    mt: 2,
    border: "1px solid",
    borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
    background: isDark 
      ? "linear-gradient(135deg, rgba(20, 20, 20, 0.7) 0%, rgba(10, 10, 10, 0.8) 100%)"
      : "linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(249, 250, 251, 0.8) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: isDark
      ? "0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.5)",
  };

  return (
    <Card elevation={0} sx={cardStyle}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 2.5, letterSpacing: "-0.01em" }}>
          Logs
        </Typography>
        <Stack spacing={0} sx={{ maxHeight: 350, overflowY: "auto", pr: 1 }}>
          {displayLogs.map((log, idx) => (
            <Box key={log.id}>
              <Box sx={{ py: 1.5, px: 0.5, transition: 'background 0.2s', '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) } }}>

                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Typography variant="caption" sx={{ 
                    minWidth: 160, 
                    color: "text.secondary", 
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    opacity: 0.8
                  }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: log.type === "error" ? "#f87171" : 
                             log.type === "warning" ? "#fbbf24" : "text.primary",
                      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
                      fontSize: "0.85rem",
                      lineHeight: 1.5,
                      fontWeight: 500
                    }}
                  >
                    <span style={{ opacity: 0.5, marginRight: '8px' }}>[{log.type.toUpperCase()}]</span>
                    {log.message}
                  </Typography>
                </Stack>
              </Box>
              {idx < displayLogs.length - 1 && (
                <Divider sx={{ opacity: isDark ? 0.05 : 0.1 }} />
              )}
            </Box>
          ))}
          {displayLogs.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No logs available.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}


