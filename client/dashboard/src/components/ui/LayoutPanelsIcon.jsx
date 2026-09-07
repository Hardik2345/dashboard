export default function LayoutPanelsIcon({ size = 18, stroke = "currentColor" }) {
  const radius = size * 0.14;
  const strokeWidth = Math.max(1.6, size * 0.11);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="1.75"
        y="1.75"
        width="16.5"
        height="16.5"
        rx={radius}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <path
        d="M6 2.4V17.6M13.9 2.4V9M6 7.2H13.9M13.9 7.2H18M13.9 9H18M13.9 9V12.2M6 12.2H18"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
