import Grid from "@mui/material/Grid2";
import KPIStat from "../../../components/KPIStat.jsx";

function formatInteger(value) {
  return Number(value || 0).toLocaleString();
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function SessionKPIRow({ summary, loading }) {
  const cards = [
    {
      key: "totalSessions",
      label: "Total Sessions",
      value: summary?.totalSessions || 0,
      formatter: formatInteger,
    },
    {
      key: "uniqueUsers",
      label: "Unique Users",
      value: summary?.uniqueUsers || 0,
      formatter: formatInteger,
    },
    {
      key: "sessionsPerUser",
      label: "Sessions Per User",
      value: summary?.sessionsPerUser || 0,
      formatter: formatDecimal,
    },
    {
      key: "activeBrands",
      label: "Active Brands",
      value: summary?.activeBrands || 0,
      formatter: formatInteger,
    },
  ];

  return (
    <Grid container spacing={{ xs: 1.5, md: 2 }}>
      {cards.map((card) => (
        <Grid key={card.key} size={{ xs: 12, sm: 6, md: 3 }}>
          <KPIStat
            label={card.label}
            value={card.value}
            formatter={card.formatter}
            loading={loading}
          />
        </Grid>
      ))}
    </Grid>
  );
}
