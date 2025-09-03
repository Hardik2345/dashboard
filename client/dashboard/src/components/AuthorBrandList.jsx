import { useEffect, useState } from 'react';
import { Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography, CircularProgress } from '@mui/material';

export default function AuthorBrandList({ refreshSignal }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    fetch('/author/brands', { credentials: 'include' })
      .then(r=>r.json())
      .then(json=>{ if(!cancelled) { setRows(json.brands||[]); setLoading(false); }})
      .catch(()=>!cancelled && setLoading(false));
    return ()=>{cancelled=true};
  },[refreshSignal]);

  return (
    <Paper sx={{ p:2 }} elevation={1}>
      <Typography variant="subtitle2" sx={{ mb:1 }}>Existing Brands (runtime + env)</Typography>
      {loading ? <CircularProgress size={20} /> : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>Host</TableCell>
              <TableCell>DB</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r=> <TableRow key={r.key}><TableCell>{r.key}</TableCell><TableCell>{r.host}</TableCell><TableCell>{r.db}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
