import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import dayjs from "dayjs";
import StatusBadge from "../../../components/ui/StatusBadge.jsx";
import LatencyChart from "./LatencyChart.jsx";
import { getHealthMonitorServiceDetail, getHealthMonitorEndpointHistory } from "../../../lib/api.js";

function formatTimestamp(value) {
  if (!value) return "-";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("MMM D, HH:mm:ss") : "-";
}

export default function ServiceDetailDrawer({ serviceName, open, onClose }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [range, setRange] = useState("1h");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!serviceName) return;
    setLoading(true);
    setError(null);
    const res = await getHealthMonitorServiceDetail(serviceName);
    if (res.error) {
      setError("Failed to load service detail.");
      setDetail(null);
    } else {
      setDetail(res.data);
      const firstEndpoint = res.data?.endpoints?.[0];
      setSelectedEndpoint(firstEndpoint ? `${firstEndpoint.method} ${firstEndpoint.path}` : null);
    }
    setLoading(false);
  }, [serviceName]);

  useEffect(() => {
    if (open) {
      loadDetail();
      setRange("1h");
    }
  }, [open, loadDetail]);

  const loadHistory = useCallback(async () => {
    if (!serviceName || !selectedEndpoint) return;
    setHistoryLoading(true);
    const res = await getHealthMonitorEndpointHistory({ serviceName, endpoint: selectedEndpoint, range });
    setHistory(res.error ? null : res.data);
    setHistoryLoading(false);
  }, [serviceName, selectedEndpoint, range]);

  useEffect(() => {
    if (open && selectedEndpoint) loadHistory();
  }, [open, selectedEndpoint, range, loadHistory]);

  return (
    <Drawer
      anchor={isMobile ? "bottom" : "right"}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isMobile ? "100%" : 480,
          height: isMobile ? "85vh" : "100%",
          borderTopLeftRadius: isMobile ? 20 : 0,
          borderTopRightRadius: isMobile ? 20 : 0,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {serviceName || "Service"}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2, overflowY: "auto", flex: 1 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && detail && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <StatusBadge status={detail.status} />
              <Typography variant="body2" color="text.secondary">
                {detail.openIncidents} open incident{detail.openIncidents === 1 ? "" : "s"}
              </Typography>
            </Box>

            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Endpoints
            </Typography>
            <TableContainer sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Endpoint</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Latency</TableCell>
                    <TableCell>Interval</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.endpoints || []).map((endpoint) => {
                    const key = `${endpoint.method} ${endpoint.path}`;
                    return (
                      <TableRow
                        key={key}
                        hover
                        selected={selectedEndpoint === key}
                        onClick={() => setSelectedEndpoint(key)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {key}
                          </Typography>
                          {endpoint.critical && (
                            <Chip label="critical" size="small" sx={{ height: 18, fontSize: 10, mt: 0.25 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={endpoint.status} size="small" />
                        </TableCell>
                        <TableCell align="right">
                          {endpoint.latency == null ? "-" : `${endpoint.latency} ms`}
                        </TableCell>
                        <TableCell>{endpoint.intervalLabel}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(!detail.endpoints || detail.endpoints.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3, color: "text.secondary" }}>
                        No data for the selected range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {selectedEndpoint && (
              <LatencyChart
                history={history}
                loading={historyLoading}
                range={range}
                onRangeChange={setRange}
              />
            )}

            {detail.recentIncidents?.open?.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
                  Open incidents
                </Typography>
                {detail.recentIncidents.open.map((incident) => (
                  <Box key={incident.incidentId} sx={{ mb: 1, p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {incident.endpoint} — {incident.severity}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Started {formatTimestamp(incident.startedAt)} · {incident.failureCount} failure(s)
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
