import {
  Alert,
  Box,
  Button,
  Container,
  CssBaseline,
  Divider,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
} from "@mui/material";
import Unauthorized from "../components/Unauthorized.jsx";

export default function AuthRouteContainer({
  lightTheme,
  loginForm,
  setLoginForm,
  loginError,
  loggingIn,
  handleLogin,
}) {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname || "/";
  const error = params.get("error") || "";
  const reason = params.get("reason") || "";
  const isUnauthorized =
    (path.startsWith("/login") || path.startsWith("/unauthorized")) &&
    (error === "google_oauth_failed" ||
      error === "not_authorized" ||
      reason === "not_authorized_domain");

  if (isUnauthorized) {
    return (
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <Unauthorized />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100svh",
          bgcolor: "background.default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
        }}
      >
        <Container maxWidth="xs">
          <Paper
            elevation={3}
            sx={{ p: 3, borderRadius: 3 }}
            component="form"
            onSubmit={handleLogin}
          >
            <Stack spacing={2}>
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Box
                  component="img"
                  src="/brand-logo-final.png"
                  alt="Datum"
                  sx={{ height: 80, width: 220, objectFit: "contain" }}
                />
              </Box>
              <TextField
                size="small"
                label="Email"
                type="email"
                required
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <TextField
                size="small"
                label="Password"
                type="password"
                required
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              {loginError && <Alert severity="error">{loginError}</Alert>}
              <Button variant="contained" type="submit" disabled={loggingIn}>
                {loggingIn ? "Logging in..." : "Login"}
              </Button>
              <Divider>or</Divider>
              <button
                type="button"
                className="gsi-material-button"
                onClick={() => {
                  const base = import.meta.env.VITE_API_BASE || "/api";
                  const target = base.startsWith("http")
                    ? base
                    : `${window.location.origin}${base}`;

                  const redirect =
                    import.meta.env.VITE_OAUTH_REDIRECT ||
                    window.location.origin;

                  window.location.href = `${target.replace(/\/$/, "")}/auth/google/start?redirect=${encodeURIComponent(redirect)}`;
                  console.log(window.location.href);
                }}
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon" aria-hidden>
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      xmlnsXlink="http://www.w3.org/1999/xlink"
                      style={{ display: "block" }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      ></path>
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      ></path>
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      ></path>
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      ></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    Sign in with Google
                  </span>
                  <span style={{ display: "none" }}>Sign in with Google</span>
                </div>
              </button>
            </Stack>
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
