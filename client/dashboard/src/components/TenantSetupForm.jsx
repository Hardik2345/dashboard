import React, { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Stack,
  TextField,
  Button,
  Box,
  Grid,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";

export default function TenantSetupForm({ onOnboard }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  
  const [form, setForm] = useState({
    tenantId: "",
    tenantName: "",
    clientId: "",
    clientSecret: "",
    shopName: "",
    authCode: "",
    shopifyUrl: "",
    websiteUrl: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "tenantId" && value !== "" && parseInt(value) <= 0) return;
    setForm((prev) => ({ ...prev, [name]: value }));
  };


  const handleSubmit = (e) => {
    e.preventDefault();
    onOnboard?.(form);
  };

  const cardStyle = {
    borderRadius: "16px",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",
    border: "1px solid",
    borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
    background: isDark 
      ? "linear-gradient(135deg, rgba(20, 20, 20, 0.7) 0%, rgba(10, 10, 10, 0.8) 100%)"
      : "linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(249, 250, 251, 0.8) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: isDark
      ? "0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.5)",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: isDark
        ? "0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)"
        : "0 12px 40px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.8)",
      borderColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.12)",
    }
  };

  const textFieldStyle = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
      "& fieldset": {
        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
        transition: "border-color 0.2s ease",
      },
      "&:hover fieldset": {
        borderColor: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.2)",
      },
      "&.Mui-focused fieldset": {
        borderColor: theme.palette.primary.main,
        borderWidth: "1.5px",
      },
    },
    "& .MuiInputLabel-root": {
      color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
    },
    "& .MuiInputBase-input": {
      fontSize: "0.9rem",
    },
    "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button": {
      "-webkit-appearance": "none",
      margin: 0,
    },
    "& input[type=number]": {
      "-moz-appearance": "textfield",
    },
  };


  return (
    <Card elevation={0} sx={cardStyle}>
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 3, letterSpacing: "-0.02em" }}>
          Tenant Setup
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {[
              { label: "Tenant ID", name: "tenantId", type: "number" },
              { label: "Tenant Name", name: "tenantName" },
              { label: "Client ID", name: "clientId" },
              { label: "Client Secret", name: "clientSecret" },
              { label: "Shop Name", name: "shopName" },
              { label: "Auth Code", name: "authCode" },
              { label: "Shopify URL", name: "shopifyUrl" },
              { label: "Website URL", name: "websiteUrl" },
            ].map((field) => (
              <Grid item xs={12} md={6} key={field.name}>
                <TextField
                  fullWidth
                  label={field.label}
                  name={field.name}
                  type={field.type || "text"}
                  variant="outlined"
                  size="small"
                  value={form[field.name]}
                  onChange={handleChange}
                  required
                  sx={textFieldStyle}
                  inputProps={field.name === "tenantId" ? { min: "1", step: "1" } : {}}
                />

              </Grid>
            ))}
            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                sx={{
                  mt: 1,
                  minWidth: 180,
                  borderRadius: "10px",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  boxShadow: "0 8px 16px rgba(59, 130, 246, 0.3)",
                  "&:hover": {
                    boxShadow: "0 12px 20px rgba(59, 130, 246, 0.4)",
                    transform: "translateY(-1px)",
                  }
                }}
              >
                Onboard Tenant
              </Button>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
}
