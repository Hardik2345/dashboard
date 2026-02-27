import { AppBar, Toolbar, Box, Button, IconButton, useTheme, useMediaQuery, Tooltip, Typography, Card } from '@mui/material';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from "dayjs/plugin/relativeTime";
import bridge from "dayjs/plugin/utc"; // Using a different name to avoid collision if needed, but 'utc' is standard
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getLastUpdatedPTS } from "../lib/api.js";
import {
  Bell,
  Sun,
  Moon,
  LayoutGrid,
  SlidersHorizontal,
  LogOut,
  PanelLeft // Added
} from 'lucide-react';
import SkyToggle from './ui/SkyToggle.jsx';
import NotificationsMenu from './NotificationsMenu.jsx';

export default function Header({
  user,
  onLogout,
  onMenuClick,
  showMenuButton = false,
  darkMode = false,
  onToggleDarkMode,
  onFilterClick,
  showFilterButton = false,
  isAdmin = false,
  brandKey = ''
}) {
  dayjs.extend(relativeTime);
  dayjs.extend(customParseFormat);

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [last, setLast] = useState({ loading: true, ts: null, tz: null });

  useEffect(() => {
    let cancelled = false;
    const normalizedKey = (brandKey || "").toString().trim().toUpperCase();
    setLast({ loading: true, ts: null, tz: null });
    getLastUpdatedPTS(normalizedKey ? { brandKey: normalizedKey } : undefined)
      .then((r) => {
        if (cancelled) return;
        let parsed = null;
        const sources = [];
        if (r.iso) sources.push(r.iso);
        if (r.raw) sources.push(r.raw);
        for (const src of sources) {
          if (parsed) break;
          const cleaned =
            typeof src === "string" ? src.replace(/ IST$/, "").trim() : src;
          if (!cleaned) continue;
          if (typeof cleaned === "string") {
            const formats = [
              "YYYY-MM-DDTHH:mm:ss.SSSZ",
              "YYYY-MM-DDTHH:mm:ssZ",
              "YYYY-MM-DD hh:mm:ss A",
              "YYYY-MM-DD HH:mm:ss",
              "YYYY-MM-DD hh:mm A",
            ];
            for (const f of formats) {
              const d = dayjs(cleaned, f, true);
              if (d.isValid()) {
                parsed = d;
                break;
              }
            }
            if (!parsed) {
              const auto = dayjs(cleaned);
              if (auto.isValid()) parsed = auto;
            }
          } else if (cleaned instanceof Date) {
            const auto = dayjs(cleaned);
            if (auto.isValid()) parsed = auto;
          }
        }
        setLast((prev) => ({
          loading: false,
          ts: parsed || prev.ts,
          tz: r.timezone || prev.tz || null,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setLast((prev) => ({ loading: false, ts: prev.ts, tz: prev.tz }));
      });
    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  // Extract first name for the greeting
  const firstName = user?.name ? user.name.split(' ')[0] : (user?.email?.split('@')[0] || 'User');

  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        borderBottom: isMobile ? '1px solid' : 'none',
        borderBottomColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        px: { xs: 1, md: 4 },
        py: { xs: 0, md: 1 }
      }}
    >
      <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: { xs: 56, md: 72 }, p: 0 }}>

        {/* Left: Greeting (Desktop) or Logo (Mobile) */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {isMobile ? (
            <Box
              component="img"
              src="/brand-logo-dark.png"
              alt="Brand"
              sx={{
                height: 50,
                width: 'auto',
                filter: darkMode ? 'invert(1) hue-rotate(180deg) brightness(1.2)' : 'none'
              }}
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: darkMode ? '#fff' : '#111', display: 'flex', alignItems: 'center', gap: 2 }}>
                Welcome, {firstName} <span style={{ fontSize: '1.2rem' }}>👋</span>

                {!isMobile && (
                  <>
                    {last.loading ? (
                      <Card
                        elevation={0}
                        sx={{
                          px: 1.5,
                          height: 28,
                          display: "flex",
                          alignItems: "center",
                          bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          fontSize: 11,
                          color: 'text.secondary',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                        }}
                      >
                        Updating…
                      </Card>
                    ) : last.ts ? (
                      <Tooltip
                        title={`${last.ts.format("YYYY-MM-DD HH:mm:ss")}${last.tz ? ` ${last.tz}` : ""}`}
                        arrow
                      >
                        <Card
                          elevation={0}
                          sx={{
                            px: 1.5,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'text.secondary',
                            bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                            borderRadius: '6px',
                            border: '1px solid',
                            borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                          }}
                        >
                          Updated {last.ts.fromNow()}
                        </Card>
                      </Tooltip>
                    ) : (
                      <Card
                        elevation={0}
                        sx={{
                          px: 1.5,
                          height: 28,
                          display: "flex",
                          alignItems: "center",
                          fontSize: 11,
                          color: 'text.secondary',
                          bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                        }}
                      >
                        Updated: unavailable
                      </Card>
                    )}
                  </>
                )}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Your store at a glance
              </Typography>
            </Box>
          )}
        </Box>

        {/* Right: Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 1.5 } }}>

          {/* Mobile Filter Button */}
          {showFilterButton && isMobile && (
            <IconButton
              onClick={onFilterClick}
              size="small"
              sx={{
                color: darkMode ? '#f0f0f0' : 'inherit',
                bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: '1px solid',
                borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                borderRadius: '8px',
                p: 0.8
              }}
            >
              <SlidersHorizontal size={18} />
            </IconButton>
          )}

          {/* Desktop Actions */}
          {!isMobile && (
            <>
              {/* Notifications - Only for admins */}
              {isAdmin && (
                <NotificationsMenu darkMode={darkMode} />
              )}

              {/* Theme Toggle */}
              <SkyToggle checked={darkMode} onChange={onToggleDarkMode} />

              {/* Logout - Only for non-admins (admins have it in sidebar) */}
              {!isAdmin && (
                <Tooltip title="Logout">
                  <IconButton
                    onClick={onLogout}
                    size="small"
                    sx={{
                      bgcolor: darkMode ? 'rgba(211, 47, 47, 0.1)' : 'rgba(211, 47, 47, 0.05)',
                      borderRadius: '10px',
                      p: 1.2,
                      color: '#d32f2f', // Red color
                      '&:hover': { bgcolor: darkMode ? 'rgba(211, 47, 47, 0.2)' : 'rgba(211, 47, 47, 0.1)' }
                    }}
                  >
                    <LogOut size={20} />
                  </IconButton>
                </Tooltip>
              )}

              {/* Customize Widget Button - Only for admins */}
              {isAdmin && (
                <Box sx={{ ml: 1 }}>
                  {/*
                  <Button
                    variant="contained"
                    startIcon={<LayoutGrid size={18} />}
                    sx={{
                      bgcolor: '#37B29B',
                      color: '#fff',
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: '10px',
                      px: 2,
                      py: 1,
                      '&:hover': { bgcolor: '#2D9381' },
                      boxShadow: 'none'
                    }}
                  >
                    Customize Widget
                  </Button>
                  */}
                  <img
                    src="/brand-logo.jpg"
                    alt="TechIt"
                    style={{
                      height: '36px',
                      width: 'auto',
                      objectFit: 'contain',
                      opacity: 0.9,
                      filter: darkMode ? 'invert(1) hue-rotate(180deg) brightness(1.5)' : 'none'
                    }}
                  />
                </Box>
              )}
            </>
          )}

          {/* Mobile Theme & Logout (Fallthrough) */}
          {isMobile && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <SkyToggle checked={darkMode} onChange={onToggleDarkMode} />
              <IconButton onClick={onLogout} size="small" sx={{ color: '#d32f2f' }}>
                <LogOut size={20} />
              </IconButton>
            </Box>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
