import React, { useState, useMemo } from 'react';
import {
    Box,
    TextField,
    InputAdornment,
    List,
    ListItemButton,
    Checkbox,
    ListItemText,
    Typography,
    Divider,
    IconButton,
    Tooltip
} from '@mui/material';
import { Search, X } from 'lucide-react';

export default function StaticSearchableList({
    label,
    options = [],
    value = [],
    onChange,
    isDark
}) {
    const [searchText, setSearchText] = useState('');

    const filteredOptions = useMemo(() => {
        if (!searchText) return options;
        const lower = searchText.toLowerCase();
        return options.filter(opt => String(opt).toLowerCase().includes(lower));
    }, [options, searchText]);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minWidth: 160,
            maxWidth: '100%',
            overflow: 'hidden'
        }}>
            <Typography variant="caption" sx={{ px: 2, pt: 1, pb: 0.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                {label}
            </Typography>

            <Box sx={{ px: 1, pb: 1 }}>
                <TextField
                    size="small"
                    placeholder="Search..."
                    fullWidth
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search size={14} />
                            </InputAdornment>
                        ),
                        endAdornment: searchText && (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setSearchText('')}>
                                    <X size={14} />
                                </IconButton>
                            </InputAdornment>
                        ),
                        sx: {
                            fontSize: '0.8rem',
                            borderRadius: '8px',
                            bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'
                        }
                    }}
                />
            </Box>

            <Divider sx={{ opacity: 0.5 }} />

            <List sx={{
                overflowY: 'auto',
                maxHeight: 250,
                py: 0,
                '&::-webkit-scrollbar': { width: '2px' },
                '&::-webkit-scrollbar-thumb': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: '4px' }
            }}>
                {filteredOptions.length > 0 ? (
                    filteredOptions.map((opt) => {
                        const isChecked = value.includes(opt);
                        return (
                            <Tooltip key={opt} title={opt} placement="right" arrow>
                                <ListItemButton
                                    onClick={() => {
                                        const newValue = isChecked
                                            ? value.filter(v => v !== opt)
                                            : [...value, opt];
                                        onChange(newValue);
                                    }}
                                    dense
                                    sx={{ py: 0.5 }}
                                >
                                    <Checkbox
                                        checked={isChecked}
                                        size="small"
                                        sx={{ p: 0.5, mr: 0.5 }}
                                    />
                                    <ListItemText
                                        primary={opt}
                                        primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                                    />
                                </ListItemButton>
                            </Tooltip>
                        );
                    })
                ) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                            No options found
                        </Typography>
                    </Box>
                )}
            </List>
        </Box>
    );
}

