import dayjs from "dayjs";
import {
  Box,
  Button,
  Card,
  CardContent,
  InputAdornment,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

function formatInteger(value) {
  return Number(value || 0).toLocaleString();
}

function formatTimestamp(value) {
  return value ? dayjs(value).format("DD MMM YYYY, hh:mm A") : "-";
}

const COLUMNS = [
  { id: "email", label: "Email" },
  { id: "brand", label: "Brand" },
  { id: "sessions", label: "Sessions", align: "right" },
  { id: "lastActive", label: "Last Active" },
  { id: "firstSeen", label: "First Seen" },
  { id: "platform", label: "Platform" },
];

export default function UserEngagementTable({
  rows = [],
  total = 0,
  loading = false,
  page = 0,
  rowsPerPage = 10,
  search = "",
  sort = "sessions",
  direction = "desc",
  onPageChange,
  onRowsPerPageChange,
  onSearchChange,
  onSortChange,
  onExport,
}) {
  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 }, "&:last-child": { pb: { xs: 1.5, md: 2 } } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", sm: "center" }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.secondary" }}>
              User Engagement
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                size="small"
                placeholder="Search users"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <Button variant="outlined" size="small" onClick={onExport}>
                Export CSV
              </Button>
            </Stack>
          </Stack>

          {loading ? (
            <Skeleton variant="rounded" height={320} />
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table stickyHeader sx={{ minWidth: 860 }}>
                <TableHead>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableCell key={column.id} align={column.align || "left"}>
                        <TableSortLabel
                          active={sort === column.id}
                          direction={sort === column.id ? direction : "asc"}
                          onClick={() =>
                            onSortChange(
                              column.id,
                              sort === column.id && direction === "asc" ? "desc" : "asc",
                            )
                          }
                        >
                          {column.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length}>
                        <Box sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                          No session data found for the selected filters.
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => (
                      <TableRow key={`${row.email}-${row.brand}-${index}`} hover>
                        <TableCell>{row.email || "-"}</TableCell>
                        <TableCell>{row.brand || "-"}</TableCell>
                        <TableCell align="right">{formatInteger(row.sessions)}</TableCell>
                        <TableCell>{formatTimestamp(row.lastActive)}</TableCell>
                        <TableCell>{formatTimestamp(row.firstSeen)}</TableCell>
                        <TableCell>{row.platform || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_event, nextPage) => onPageChange(nextPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => onRowsPerPageChange(Number(event.target.value))}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
