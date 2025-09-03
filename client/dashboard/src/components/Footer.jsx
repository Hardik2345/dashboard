import { Box, Typography } from '@mui/material';

export default function Footer() {
  return (
    <Box component="footer" sx={{ py: 3, textAlign: 'center', mt: 4, color: 'text.secondary' }}>
      <Typography variant="caption" sx={{ fontSize: 12 }}>
        ©2025 TechIt!. All rights reserved.
      </Typography>
    </Box>
  );
}
