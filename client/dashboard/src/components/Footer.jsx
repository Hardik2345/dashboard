import { Box, Typography, Container, Stack } from '@mui/material';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <Box
      component="footer"
      sx={theme => ({
        mt: 6,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: theme.palette.mode === 'light' ? 'grey.50' : 'background.paper',
        py: 3,
      })}
   >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ textAlign: { xs: 'center', sm: 'left' } }}
        >
          <Typography variant="body2" color="text.secondary">
            ©{year} TechIt!. All rights reserved.
          </Typography>
          <Stack direction="row" spacing={2} sx={{ opacity: 0.85 }}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
              Privacy
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
              Terms
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
              Support
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
