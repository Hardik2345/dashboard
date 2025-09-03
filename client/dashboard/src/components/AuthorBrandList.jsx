import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, Table, TableBody, TableCell, TableHead, TableRow, Typography, CircularProgress } from '@mui/material';

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
    <Card elevation={0} sx={{ border:'1px solid', borderColor:'divider' }}>
      <CardHeader titleTypographyProps={{ variant:'h6', fontWeight:700 }} title="Existing Brands" subheader={<Typography variant="caption" color="text.secondary">Includes env + runtime-added brands.</Typography>} />
      <CardContent sx={{ pt:0 }}>
        {loading ? <CircularProgress size={20} /> : (
          <Table size="small" sx={{ '& th': { fontWeight:600 } }}>
            <TableHead>
              <TableRow>
                <TableCell width="15%">Key</TableCell>
                <TableCell width="55%">Host</TableCell>
                <TableCell width="30%">Database</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">No brands loaded.</Typography></TableCell></TableRow>
              )}
              {rows.map(r=> (
                <TableRow key={r.key} hover>
                  <TableCell>{r.key}</TableCell>
                  <TableCell sx={{ fontFamily:'monospace', fontSize:13 }}>{r.host}</TableCell>
                  <TableCell sx={{ fontFamily:'monospace', fontSize:13 }}>{r.db}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
