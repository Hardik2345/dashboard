import { Box, Typography } from "@mui/material";

export default function MaintenanceScreen() {
  return (
    <Box
      sx={{
        minHeight: "100svh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        boxSizing: "border-box",
        overflow: "hidden",
        px: 2.5,
        pt: { xs: 4, sm: 7 },
        pb: 3,
        color: "#f7f7f7",
        background: `
          radial-gradient(circle at top left, rgba(20, 200, 176, 0.16), transparent 34%),
          radial-gradient(circle at bottom right, rgba(20, 200, 176, 0.1), transparent 28%),
          linear-gradient(180deg, #070707 0%, #030303 100%)
        `,
        "&::before, &::after": {
          content: '""',
          position: "fixed",
          borderRadius: "999px",
          filter: "blur(80px)",
          opacity: 0.55,
          pointerEvents: "none",
        },
        "&::before": {
          top: "8%",
          left: "-8%",
          width: 280,
          height: 280,
          bgcolor: "rgba(20, 200, 176, 0.2)",
        },
        "&::after": {
          right: "-6%",
          bottom: "10%",
          width: 240,
          height: 240,
          bgcolor: "rgba(12, 126, 111, 0.22)",
        },
      }}
    >
      <Box
        sx={{
          width: "min(620px, calc(100vw - 40px))",
          px: { xs: 2.75, sm: 4 },
          py: { xs: 3.75, sm: 4.5 },
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 3,
          background:
            "linear-gradient(180deg, rgba(28,28,28,0.92) 0%, rgba(14,14,14,0.9) 100%)",
          boxShadow:
            "0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)",
          backdropFilter: "blur(18px)",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center", mb: 3.5 }}>
          <Box
            component="img"
            src="/brand-logo-dark.png"
            alt="Datum"
            sx={{
              width: 164,
              height: 56,
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
            }}
          />
        </Box>
        <Typography
          component="h1"
          sx={{
            m: 0,
            mb: 2,
            fontSize: "clamp(34px, 6vw, 48px)",
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            fontWeight: 700,
          }}
        >
          Hang Tight !
        </Typography>
        <Typography
          sx={{
            mb: 1.25,
            maxWidth: "48ch",
            fontSize: 16,
            lineHeight: 1.65,
            color: "rgba(247,247,247,0.76)",
          }}
        >
          We&apos;re currently deploying an update to improve your experience.
        </Typography>
        <Typography
          sx={{
            maxWidth: "48ch",
            fontSize: 16,
            lineHeight: 1.65,
            color: "rgba(247,247,247,0.76)",
          }}
        >
          Datum will be available again shortly. Thank you for your patience.
        </Typography>
      </Box>
    </Box>
  );
}
