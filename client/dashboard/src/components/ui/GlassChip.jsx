import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export const GlassChip = ({ label, onDelete, onClick, size = 'medium', isDark = false, sx = {} }) => {
    // Animation definition
    const spinKeyframes = `
    @keyframes spin {
      from { transform: translate(-50%, -50%) rotate(0deg); }
      to { transform: translate(-50%, -50%) rotate(360deg); }
    }
  `;

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'inline-flex',
                borderRadius: '9999px',
                p: '1px', // Border width
                overflow: 'hidden',
                cursor: (onClick || onDelete) ? 'pointer' : 'default',
                transition: 'transform 0.2s',
                '&:hover': (onClick || onDelete) ? {
                    transform: 'translateY(-1px)',
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
                    width: '300%', // Large enough to cover rotation
                    height: '300%',
                    background: isDark
                        ? 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(255,255,255,0.8) 360deg)'
                        : 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, #000000 360deg)',
                    animation: 'spin 9s linear infinite',
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
                    // Backgrounds
                    bgcolor: isDark ? 'rgba(44, 44, 44, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    // Padding matches original
                    pl: 1.5,
                    pr: onDelete ? 0.5 : 1.5,
                    py: size === 'small' ? 0.5 : 0.75,
                    gap: 0.5,
                    color: isDark ? '#fff' : '#000',
                    width: '100%'
                }}
            >
                <Typography
                    variant="body2"
                    sx={{
                        fontSize: size === 'small' ? '0.75rem' : '0.875rem',
                        fontWeight: 500,
                        lineHeight: 1,
                        userSelect: 'none'
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
                            p: 0.25,
                            ml: 0.25,
                            color: 'inherit',
                            opacity: 0.6,
                            transition: 'opacity 0.2s',
                            '&:hover': { opacity: 1, bgcolor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }
                        }}
                    >
                        <CloseIcon sx={{ fontSize: size === 'small' ? 14 : 16 }} />
                    </IconButton>
                )}
            </Box>
        </Box>
    );
};
