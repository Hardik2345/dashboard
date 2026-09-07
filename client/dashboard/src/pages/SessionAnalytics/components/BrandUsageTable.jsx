import {
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

function formatInteger(value) {
  return Number(value || 0).toLocaleString();
}

export default function BrandUsageTable({ rows = [], loading = false, onExport }) {
  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 }, "&:last-child": { pb: { xs: 1.5, md: 2 } } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          sx={{ mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, color: "text.secondary" }}>
            Brand Analytics
          </Typography>
          <Button variant="outlined" size="small" onClick={onExport}>
            Export CSV
          </Button>
        </Stack>
        {loading ? (
          <Skeleton variant="rounded" height={220} />
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table stickyHeader sx={{ minWidth: 420 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Brand</TableCell>
                  <TableCell align="right">Sessions</TableCell>
                  <TableCell align="right">Users</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                        No session data found for the selected filters.
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.brand || "unknown"} hover>
                      <TableCell>{row.brand || "-"}</TableCell>
                      <TableCell align="right">{formatInteger(row.sessions)}</TableCell>
                      <TableCell align="right">{formatInteger(row.users)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
