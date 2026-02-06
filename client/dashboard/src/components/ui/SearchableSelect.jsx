import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Checkbox,
    ListItemText,
    ListSubheader,
    TextField,
    InputAdornment,
    Box,
    Typography,
    Chip,
    Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

/**
 * A reusable Searchable Multi-Select Component.
 * 
 * @param {string} label - Input label
 * @param {Array} options - Array of options. If simple strings: ['A', 'B']. If objects: [{id: '1', label: 'A'}] (must specify valueKey/labelKey)
 * @param {Array|string} value - Current value(s).
 * @param {function} onChange - Callback (newValue) => void.
 * @param {string} valueKey - Key for value in object options (default: 'id').
 * @param {string} labelKey - Key for label in object options (default: 'label').
 * @param {boolean} multiple - Enable multi-select (default: true).
 * @param {boolean} loading - Loading state.
 * @param {object} sx - MUI system props.
 */
export default function SearchableSelect({
    label,
    options = [],
    value,
    onChange,
    valueKey = 'id',
    labelKey = 'label',
    multiple = true,
    loading = false,
    sx = {},
    selectSx = {},
    labelSx = {},
    renderValue, // Optional custom renderValue function
    ...props
}) {
    const [searchText, setSearchText] = useState('');
    const searchInputRef = useRef(null);

    // Normalize value to array for multi-select consistency internally
    const selectedValues = useMemo(() => {
        if (multiple) {
            if (!Array.isArray(value)) return value ? [value] : [];
            return value;
        }
        return value;
    }, [value, multiple]);

    // Determine if options are objects or primitives
    const isObjectOptions = options.length > 0 && typeof options[0] === 'object';

    // Helper to get value from option
    const getOptionValue = (opt) => isObjectOptions ? opt[valueKey] : opt;
    const getOptionLabel = (opt) => isObjectOptions ? opt[labelKey] : opt;

    // Filter options based on search text
    const filteredOptions = useMemo(() => {
        if (!searchText) return options;
        const lower = searchText.toLowerCase();
        return options.filter(opt => {
            const labelVal = String(getOptionLabel(opt)).toLowerCase();
            return labelVal.includes(lower);
        });
    }, [options, searchText, isObjectOptions, valueKey, labelKey]);

    // Handle "Select All" / "Clear All" logic
    // Only valid for multi-select
    const isAllSelected = multiple && options.length > 0 && selectedValues.length >= options.length;
    // Note: Simple equal check might not be robust for large lists, checking count is a proxy.
    // For 'All Products', usually we handle this by passing a special empty array or specific logic upstream.
    // But here we can provide a 'Select All' button inside the menu.

    const handleSelectAll = () => {
        if (isAllSelected) {
            onChange([]); // Clear all
        } else {
            // Select all visible options (or all options? usually all options)
            // If search is active, do we select only filtered? Standard UX is typically all filtered or all global.
            // Let's stick to ALL options to avoid confusion.
            const allValues = options.map(getOptionValue);
            onChange(allValues);
        }
    };

    const handleDisplayChange = (event) => {
        const { target: { value: newVal } } = event;
        // On Autocomplete/Select, sometimes value is string if not multiple.
        // If multiple, newVal is array.

        // Check if the click came from our search input (prevent bubbling issues if any, though Subheader usually handles this)

        onChange(newVal);
    };

    const clearSearch = (e) => {
        e.stopPropagation();
        setSearchText('');
        searchInputRef.current?.focus();
    };

    const handleSearchKeyDown = (e) => {
        if (e.key !== 'Escape') {
            // Stop propagation so typing doesn't trigger Select shortcuts if any
            e.stopPropagation();
        }
    };

    // Custom renderValue to handle displaying "X items selected" or chips
    const defaultRenderValue = (selected) => {
        if (!selected || (Array.isArray(selected) && selected.length === 0)) {
            return <em>All</em>; // Or 'Select...'
        }

        if (multiple) {
            // If we have access to options, valid options map
            // But 'selected' contains values. We need to find labels.
            // Optimization: If many selected, show count. 
            // If object options, we need to lookup.

            // Let's try to map values back to labels.
            // Optimization: Creates a map only if needed or just find.
            // If array is huge, this is slow. But for < 500 options OK.

            const labels = selected.map(val => {
                const found = options.find(opt => getOptionValue(opt) === val);
                return found ? getOptionLabel(found) : val;
            });

            if (labels.length > 2) {
                return `${labels.length} selected`;
            }
            return labels.join(', ');
        } else {
            const found = options.find(opt => getOptionValue(opt) === selected);
            return found ? getOptionLabel(found) : selected;
        }
    };

    return (
        <FormControl sx={{ ...sx }}>
            <InputLabel sx={labelSx}>{label}</InputLabel>
            <Select
                multiple={multiple}
                value={selectedValues}
                onChange={handleDisplayChange}
                label={label}
                renderValue={renderValue || defaultRenderValue}
                sx={selectSx}
                MenuProps={{
                    autoFocus: false, // Prevent auto focus on first item to allow search focus if we wanted
                    PaperProps: {
                        sx: { maxHeight: 400, width: 180 }
                    },
                    // Fix for search input focus getting lost
                    onAnimationEnd: () => searchInputRef.current?.focus()
                }}
                {...props}
            >
                {/* Search Field Header */}
                <ListSubheader
                    sx={{
                        bgcolor: 'background.paper',
                        zIndex: 2,
                        pt: 0,
                        pb: 0,
                        lineHeight: 'initial'
                    }}
                >
                    <TextField
                        size="small"
                        autoFocus
                        placeholder="Search"
                        fullWidth
                        sx={{ width: 140, mt: 1, height: 50 }}
                        inputRef={searchInputRef}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" color="action" />
                                </InputAdornment>
                            ),
                            endAdornment: searchText && (
                                <InputAdornment position="end">
                                    <CloseIcon
                                        fontSize="small"
                                        sx={{ cursor: 'pointer', fontSize: 16 }}
                                        onClick={clearSearch}
                                    />
                                </InputAdornment>
                            )
                        }}
                    />
                </ListSubheader>

                {/* Select All Option (Only if multiple and no search text for simplicity, or always?) */}

                {/* Filtered Options */}
                {filteredOptions.length > 0 ? (
                    filteredOptions.map((opt) => {
                        const val = getOptionValue(opt);
                        const labelStr = getOptionLabel(opt);
                        const isChecked = selectedValues.includes(val);

                        return (
                            <MenuItem key={val} value={val} sx={{ py: 0.5 }}>
                                {multiple && <Checkbox checked={isChecked} size="small" sx={{ p: 0.5, mr: 0.5 }} />}
                                <Tooltip title={labelStr} placement="right" arrow>
                                    <ListItemText
                                        primary={labelStr}
                                        secondary={isObjectOptions && opt.detail ? opt.detail : null}
                                        primaryTypographyProps={{
                                            fontSize: 13,
                                            noWrap: true,
                                            sx: { maxWidth: '200px' }
                                        }}
                                        secondaryTypographyProps={{ fontSize: 11 }}
                                    />
                                </Tooltip>
                            </MenuItem>
                        );
                    })
                ) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            No results found
                        </Typography>
                    </Box>
                )}
            </Select>
        </FormControl>
    );
}
