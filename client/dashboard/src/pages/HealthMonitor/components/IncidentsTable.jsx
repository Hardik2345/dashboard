import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import StatusBadge from "../../../components/ui/StatusBadge.jsx";
import { getHealthMonitorIncidents } from "../../../lib/api.js";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "CRITICAL", label: "Critical" },
  { value: "WARNING", label: "Warning" },
];

function formatTimestamp(value) {
  if (!value) return "-";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("MMM D, HH:mm") : "-";
}

function formatDuration(ms) {
  if (ms == null) return "-";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

export default function IncidentsTable() {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getHealthMonitorIncidents({ status, severity, page, pageSize });
    if (res.error) {
      setError("Failed to load incidents.");
    } else {
      setIncidents(res.data.incidents || []);
      setTotal(res.data.total || 0);
    }
    setLoading(false);
  }, [status, severity, page, pageSize]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleChangePage = (_event, newPage) => setPage(newPage + 1);
  const handleChangeRowsPerPage = (event) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1);
  };

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mr: "auto" }}>
            Recent Incidents
          </Typography>
          <TextField
            select
            size="small"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 140 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 150 }}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <TableContainer sx={{ position: "relative" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell>Endpoint</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Started</TableCell>
                <TableCell>Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && incidents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: "text.secondary" }}>
                    No data for the selected range.
                  </TableCell>
                </TableRow>
              )}
              {incidents.map((incident) => (
                <TableRow key={incident.incidentId}>
                  <TableCell>{incident.service}</TableCell>
                  <TableCell>{incident.endpoint}</TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: incident.severity === "CRITICAL" ? "#ef4444" : "#f59e0b" }}
                    >
                      {incident.severity}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={incident.status === "OPEN" ? "UNHEALTHY" : "HEALTHY"} size="small" />
                  </TableCell>
                  <TableCell>{formatTimestamp(incident.startedAt)}</TableCell>
                  <TableCell>{incident.status === "OPEN" ? "ongoing" : formatDuration(incident.duration)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {error && (
            <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.16)", px: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}
          {loading && (
            <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.12)", pointerEvents: "none" }}>
              <CircularProgress size={24} />
            </Box>
          )}
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={Math.max(0, page - 1)}
          onPageChange={handleChangePage}
          rowsPerPage={pageSize}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </CardContent>
    </Card>
  );
}
