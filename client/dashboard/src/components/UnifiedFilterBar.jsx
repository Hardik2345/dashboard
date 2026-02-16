
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Box,
    Paper,
    Button,
    Divider,
    Popover,
    Typography,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    useTheme,
    Collapse,
} from '@mui/material';
import {
    CalendarDays,
    ChevronDown,
    Download,
    Filter,
} from 'lucide-react';
import { DatePicker } from '@shopify/polaris';
import dayjs from 'dayjs';
import SearchableSelect from './ui/SearchableSelect.jsx';

// Date Presets (Same as MobileTopBar for consistency)
const DATE_PRESETS = [
    { label: "Today", getValue: () => [dayjs().startOf("day"), dayjs().startOf("day")], group: 1 },
    { label: "Yesterday", getValue: () => [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").startOf("day")], group: 1 },
    { label: "Last 7 days", getValue: () => [dayjs().subtract(7, "day").startOf("day"), dayjs().subtract(1, "day").startOf("day")], group: 2 },
    { label: "Last 30 days", getValue: () => [dayjs().subtract(30, "day").startOf("day"), dayjs().subtract(1, "day").startOf("day")], group: 2 },
    { label: "Last month", getValue: () => [dayjs().subtract(1, 'month').startOf('month').startOf('day'), dayjs().subtract(1, 'month').endOf('month').startOf('day')], group: 2 },
    { label: "Month-to-date", getValue: () => [dayjs().startOf('month').startOf('day'), dayjs().startOf('day')], group: 2 },
    { label: "Last 90 days", getValue: () => [dayjs().subtract(90, "day").startOf("day"), dayjs().subtract(1, "day").startOf("day")], group: 2 },
];

export default function UnifiedFilterBar({
    range,
    onRangeChange,
    brandKey,
    brands = [],
    onBrandChange,
    isAuthor,
    // Filter Props
    productOptions = [],
    productValue,
    onProductChange,
    productLoading,
    utm = {},
    onUtmChange,
    salesChannel,
    onSalesChannelChange,
    allowedFilters = { product: true, utm: true, salesChannel: true },
    utmOptions = {}, // Add prop
    onDownload // Callback for download button
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [start, end] = range || [];

    // --- Popover States ---
    const [dateAnchor, setDateAnchor] = useState(null);
    const [brandAnchor, setBrandAnchor] = useState(null);
    const [filterAnchor, setFilterAnchor] = useState(null);

    // --- Date Picker State ---
    const [month, setMonth] = useState((end || start || dayjs()).month());
    const [year, setYear] = useState((end || start || dayjs()).year());

    // --- Date Logic ---
    useEffect(() => {
        const focus = end || start;
        if (focus) {
            setMonth(focus.month());
            setYear(focus.year());
        }
    }, [start, end, dateAnchor]); // Update when opening

    const handleDateClick = (event) => setDateAnchor(event.currentTarget);
    const handleDateClose = () => setDateAnchor(null);

    const handlePresetSelect = (preset) => {
        const [s, e] = preset.getValue();
        onRangeChange([s, e]);
        handleDateClose();
    };

    const handleCalendarChange = ({ start: ns, end: ne }) => {
        const s = ns ? dayjs(ns).startOf("day") : null;
        const e = ne ? dayjs(ne).startOf("day") : null;
        onRangeChange([s, e ?? s ?? null]);
    };

    const dateLabel = useMemo(() => {
        if (!start) return "Select dates";
        if (start && end && start.isSame(end, 'day')) return start.format("MMM DD, YYYY");
        return `${start.format("MMM DD")} - ${end ? end.format("MMM DD, YYYY") : '...'}`;
    }, [start, end]);

    // --- Brand Logic ---
    const handleBrandClick = (event) => setBrandAnchor(event.currentTarget);
    const handleBrandClose = () => setBrandAnchor(null);
    const handleBrandSelect = (key) => {
        onBrandChange(key);
        handleBrandClose();
    };

    // --- Filter Logic ---
    const handleFilterClick = (event) => setFilterAnchor(event.currentTarget);
    const handleFilterClose = () => setFilterAnchor(null);

    const activeFilterCount = [
        salesChannel,
        utm?.source?.length,
        utm?.medium?.length,
        utm?.campaign?.length,
        productValue?.id // Product is active if ID exists and not default
    ].filter(Boolean).length;

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* The Unified Bar */}
            <Paper
                elevation={0}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderRadius: '12px',
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    overflow: 'hidden',
                    height: 40, // Fixed height for consistency
                }}
            >
                {/* Metric/Date Segment */}
                <Button
                    onClick={handleDateClick}
                    startIcon={<CalendarDays size={16} />}
                    endIcon={<ChevronDown size={14} />}
                    sx={{
                        px: 2,
                        height: '100%',
                        color: 'text.primary',
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        borderRadius: 0,
                        '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }
                    }}
                >
                    {dateLabel}
                </Button>

                <Divider orientation="vertical" flexItem sx={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

                {/* Brand Segment (Only if multibrand/author) */}
                {(isAuthor || brands.length > 1) && (
                    <>
                        <Button
                            onClick={handleBrandClick}
                            endIcon={<ChevronDown size={14} />}
                            sx={{
                                px: 2,
                                height: '100%',
                                color: 'text.primary',
                                textTransform: 'none',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                borderRadius: 0,
                                minWidth: 100,
                                justifyContent: 'space-between',
                                whiteSpace: 'nowrap',
                                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }
                            }}
                        >
                            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120, display: 'block' }}>
                                {brandKey || 'Select Brand'}
                            </Box>
                        </Button>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                    </>
                )}

                {/* Division/Filters Segment */}
                <Button
                    onClick={handleFilterClick}
                    endIcon={<ChevronDown size={14} />}
                    sx={{
                        px: 2,
                        height: '100%',
                        color: 'text.primary',
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        borderRadius: 0,
                        '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }
                    }}
                >
                    Division(All)
                    {activeFilterCount > 0 && (
                        <Box
                            component="span"
                            sx={{
                                ml: 1,
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                borderRadius: '50%',
                                width: 18,
                                height: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.65rem'
                            }}
                        >
                            {activeFilterCount}
                        </Box>
                    )}
                </Button>
            </Paper>

            {/* Download Button (Separate) */}
            <IconButton
                onClick={onDownload}
                sx={{
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderRadius: '10px',
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    height: 40,
                    width: 40,
                    color: 'text.secondary',
                    '&:hover': {
                        bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        color: 'text.primary'
                    }
                }}
            >
                <Download size={18} />
            </IconButton>

            {/* --- Popovers --- */}

            {/* Date Popover */}
            <Popover
                open={Boolean(dateAnchor)}
                anchorEl={dateAnchor}
                onClose={handleDateClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{
                    sx: {
                        mt: 1,
                        borderRadius: 2,
                        overflow: 'hidden',
                        maxWidth: 'fit-content',
                        backdropFilter: 'blur(12px)',
                        backgroundColor: isDark ? 'rgba(30, 30, 30, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                        border: '1px solid',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.1)',
                    }
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
                    {/* Presets */}
                    <List sx={{ minWidth: 140, bgcolor: 'transparent', borderRight: '1px solid', borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.1)', py: 0 }}>
                        {DATE_PRESETS.map((p) => (
                            <ListItemButton key={p.label} onClick={() => handlePresetSelect(p)} dense sx={{ '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } }}>
                                <ListItemText primary={p.label} primaryTypographyProps={{ variant: 'body2' }} />
                            </ListItemButton>
                        ))}
                    </List>
                    {/* Calendar */}
                    <Box sx={{
                        p: 2,
                        maxWidth: 350,
                        '& .Polaris-DatePicker': { background: 'transparent !important' },
                        '& .Polaris-DatePicker__Month': { background: 'transparent !important' },
                        '& .Polaris-DatePicker__Title': { color: isDark ? '#fff' : 'inherit' },
                        '& .Polaris-DatePicker__Day': { color: isDark ? '#ddd' : 'inherit', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.1)' : '' } },
                        '& .Polaris-DatePicker__Day--today': { color: isDark ? '#fff' : 'inherit', fontWeight: 'bold' },
                        '& .Polaris-DatePicker__Day--selected': { bgcolor: 'primary.main', color: '#fff' },
                        '& .Polaris-DatePicker__Day--inRange': { bgcolor: isDark ? 'rgba(91, 163, 224, 0.3)' : 'rgba(11, 107, 203, 0.1)' },
                    }}>
                        <DatePicker
                            month={month}
                            year={year}
                            onChange={handleCalendarChange}
                            onMonthChange={(m, y) => { setMonth(m); setYear(y); }}
                            selected={start && end ? { start: start.toDate(), end: end.toDate() } : undefined}
                            allowRange
                        />
                    </Box>
                </Box>
            </Popover>

            {/* Brand Popover */}
            <Popover
                open={Boolean(brandAnchor)}
                anchorEl={brandAnchor}
                onClose={handleBrandClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { mt: 1, borderRadius: 2, minWidth: 200, maxHeight: 300 } }}
            >
                <List dense>
                    {brands.map((b) => (
                        <ListItemButton
                            key={b.key}
                            selected={(brandKey || '').toUpperCase() === b.key}
                            onClick={() => handleBrandSelect(b.key)}
                        >
                            <ListItemText primary={b.key} />
                        </ListItemButton>
                    ))}
                </List>
            </Popover>

            {/* Filter Popover */}
            <Popover
                open={Boolean(filterAnchor)}
                anchorEl={filterAnchor}
                onClose={handleFilterClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { mt: 1, borderRadius: 2, width: 260, p: 1.5 } }}
            >
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, fontSize: '0.875rem' }}>Filter Dashboard</Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {/* Sales Channel */}
                    {allowedFilters.salesChannel && (
                        <SearchableSelect
                            label="Sales Channel"
                            options={['Online Store', 'Point of Sale', 'Draft Orders', 'Google', 'Facebook']} // Ideally passed as props
                            value={salesChannel}
                            onChange={onSalesChannelChange}
                            sx={{ width: '100%' }}
                            size="small"
                        />
                    )}

                    {/* Product Filter */}
                    {allowedFilters.product && (
                        <SearchableSelect
                            label="Product"
                            options={productOptions}
                            value={productValue?.id || ''}
                            onChange={(newId) => {
                                const selected = productOptions.find(p => p.id === newId);
                                onProductChange(selected);
                            }}
                            valueKey="id"
                            labelKey="label"
                            sx={{ width: '100%' }}
                            loading={productLoading}
                            size="small"
                        />
                    )}

                    {/* UTM Filters */}
                    {allowedFilters.utm && (
                        <>
                            <Divider sx={{ my: 0.5 }} />
                            <Typography variant="caption" color="text.secondary">UTM Parameters</Typography>
                            {['source', 'medium', 'campaign'].map((field) => (
                                <SearchableSelect
                                    key={field}
                                    label={field.charAt(0).toUpperCase() + field.slice(1)}
                                    multiple
                                    options={utmOptions?.[`utm_${field}`] || []}
                                    value={utm?.[field] || []}
                                    onChange={(val) => onUtmChange({ ...utm, [field]: val })}
                                    sx={{ width: '100%' }}
                                    size="small"
                                />
                            ))}
                        </>
                    )}

                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                            onUtmChange({});
                            onSalesChannelChange('');
                            onProductChange(null);
                            handleFilterClose();
                        }}
                        sx={{ mt: 1 }}
                    >
                        Clear All Filters
                    </Button>
                </Box>
            </Popover>
        </Box>
    );
}
