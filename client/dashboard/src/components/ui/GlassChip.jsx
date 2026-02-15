import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export const GlassChip = ({ label, onDelete, onClick, size = 'medium', isDark = false, color = 'primary', sx = {} }) => {
    // Animation definition
    const spinKeyframes = `
    @keyframes spin {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to { transform: translate(-50%, -50%) rotate(360deg); }
    }
  `;

    // Map color props to actual values
    const getColorStyles = () => {
        if (color === 'success') return { bg: 'rgba(16, 185, 129, 0.2)', text: isDark ? '#34d399' : '#065f46', border: 'rgba(16, 185, 129, 0.6)' };
        if (color === 'error') return { bg: 'rgba(239, 68, 68, 0.2)', text: isDark ? '#f87171' : '#991b1b', border: 'rgba(239, 68, 68, 0.6)' };
        if (color === 'warning') return { bg: 'rgba(245, 158, 11, 0.2)', text: isDark ? '#fbbf24' : '#92400e', border: 'rgba(245, 158, 11, 0.6)' };
        if (color === 'primary') return { bg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.1)', text: isDark ? '#60a5fa' : '#1d4ed8', border: 'rgba(59, 130, 246, 0.6)' };
        return { bg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', text: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', border: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' };
    };

    const styles = getColorStyles();

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'inline-flex',
                borderRadius: '9999px',
                p: '1.2px', // Slightly thicker for border animation visibility
                overflow: 'hidden',
                cursor: (onClick || onDelete) ? 'pointer' : 'default',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': (onClick || onDelete) ? {
                    transform: 'translateY(-2px)',
                    boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.1)',
                } : {},
                ...sx
            }}
            onClick={onClick}
        >
            <style>
                {spinKeyframes}
            </style>

            {/* Moving Gradient Border Layer */}
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '400%',
                    height: '400%',
                    background: `conic-gradient(from 0deg, transparent 0deg, transparent 300deg, ${styles.border} 360deg)`,
                    animation: 'spin 4s linear infinite',
                    zIndex: 0
                }}
            />

            {/* Inner Content Layer (Glass) */}
            <Box
                sx={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '9999px',
                    bgcolor: styles.bg,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    pl: 1.5,
                    pr: onDelete ? 0.5 : 1.5,
                    py: size === 'small' ? 0.5 : 0.75,
                    gap: 0.5,
                    color: styles.text,
                    width: '100%',
                }}
            >
                <Typography
                    variant="body2"
                    sx={{
                        fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        userSelect: 'none',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {label}
                </Typography>
                {onDelete && (
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        sx={{
                            p: 0.2,
                            ml: 0.2,
                            color: 'inherit',
                            opacity: 0.6,
                            transition: 'opacity 0.2s',
                            '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                    >
                        <CloseIcon sx={{ fontSize: size === 'small' ? 14 : 16 }} />
                    </IconButton>
                )}
            </Box>
        </Box>
    );
};
