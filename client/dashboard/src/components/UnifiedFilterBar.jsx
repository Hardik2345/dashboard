
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
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Checkbox,
    FormControlLabel,
} from '@mui/material';
import {
    CalendarDays,
    ChevronDown,
    Download,
    Filter,
} from 'lucide-react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
    const [expandedAccordion, setExpandedAccordion] = useState('channel'); // Default expanded

    const handleAccordionChange = (panel) => (event, isExpanded) => {
        setExpandedAccordion(isExpanded ? panel : false);
    };

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
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                PaperProps={{
                    sx: {
                        mt: 0.5,
                        borderRadius: 3,
                        width: 400,
                        height: 380,
                        overflow: 'auto',
                        backdropFilter: 'blur(12px)',
                        backgroundColor: isDark ? 'rgba(30, 30, 30, 0.7)' : 'rgba(255, 255, 255, 0.85)',
                        border: '1px solid',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.1)',
                    }
                }}
            >
                <Box sx={{ p: 2, pb: 1, borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 500, fontSize: '0.75rem', color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Filter Dashboard
                    </Typography>
                </Box>

                <Box sx={{ p: 0.5 }}>
                    {/* CHANNEL Section */}
                    {allowedFilters.salesChannel && (
                        <Accordion
                            expanded={expandedAccordion === 'channel'}
                            onChange={handleAccordionChange('channel')}
                            disableGutters
                            elevation={0}
                            sx={{
                                bgcolor: 'transparent',
                                '&:before': { display: 'none' },
                                borderBottom: expandedAccordion === 'channel' ? '1px solid' : 'none',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                            }}
                        >
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
                                sx={{
                                    px: 2,
                                    minHeight: 44,
                                    '& .MuiAccordionSummary-content': { my: 1 }
                                }}
                            >
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Channel
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
                                <SearchableSelect
                                    label="Sales Channel"
                                    options={['Online Store', 'Point of Sale', 'Draft Orders', 'Google', 'Facebook']}
                                    value={salesChannel}
                                    onChange={onSalesChannelChange}
                                    sx={{ width: '100%' }}
                                    size="small"
                                />
                            </AccordionDetails>
                        </Accordion>
                    )}

                    {/* PRODUCT Section */}
                    {allowedFilters.product && (
                        <Accordion
                            expanded={expandedAccordion === 'product'}
                            onChange={handleAccordionChange('product')}
                            disableGutters
                            elevation={0}
                            sx={{
                                bgcolor: 'transparent',
                                '&:before': { display: 'none' },
                                borderBottom: expandedAccordion === 'product' ? '1px solid' : 'none',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                            }}
                        >
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
                                sx={{
                                    px: 2,
                                    minHeight: 44,
                                    '& .MuiAccordionSummary-content': { my: 1 }
                                }}
                            >
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Product
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
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
                            </AccordionDetails>
                        </Accordion>
                    )}

                    {/* UTM PARAMETERS Section */}
                    {allowedFilters.utm && (
                        <Accordion
                            expanded={expandedAccordion === 'utm'}
                            onChange={handleAccordionChange('utm')}
                            disableGutters
                            elevation={0}
                            sx={{
                                bgcolor: 'transparent',
                                '&:before': { display: 'none' }
                            }}
                        >
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />}
                                sx={{
                                    px: 2,
                                    minHeight: 44,
                                    '& .MuiAccordionSummary-content': { my: 1 }
                                }}
                            >
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Utm Parameters
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                    {Object.entries(utmOptions?.utm_tree || {}).map(([source, sourceData]) => {
                                        const isSourceSelected = (utm?.source || []).includes(source);
                                        return (
                                            <Accordion
                                                key={source}
                                                disableGutters
                                                elevation={0}
                                                sx={{
                                                    bgcolor: 'transparent',
                                                    '&:before': { display: 'none' },
                                                    borderBottom: '1px solid',
                                                    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
                                                }}
                                            >
                                                <AccordionSummary
                                                    expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                                                    sx={{
                                                        minHeight: 36,
                                                        px: 0,
                                                        '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' }
                                                    }}
                                                >
                                                    <Checkbox
                                                        size="small"
                                                        checked={isSourceSelected}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onChange={(e) => {
                                                            const newSources = e.target.checked
                                                                ? [...(utm?.source || []), source]
                                                                : (utm?.source || []).filter(s => s !== source);
                                                            onUtmChange({ ...utm, source: newSources });
                                                        }}
                                                    />
                                                    <Typography sx={{ fontSize: '0.8rem', fontWeight: isSourceSelected ? 600 : 400 }}>{source}</Typography>
                                                </AccordionSummary>
                                                <AccordionDetails sx={{ px: 2, pb: 1, pt: 0 }}>
                                                    {Object.entries(sourceData.mediums || {}).map(([medium, mediumData]) => {
                                                        const isMediumSelected = (utm?.medium || []).includes(medium);
                                                        return (
                                                            <Accordion
                                                                key={medium}
                                                                disableGutters
                                                                elevation={0}
                                                                sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}
                                                            >
                                                                <AccordionSummary
                                                                    expandIcon={<ExpandMoreIcon sx={{ fontSize: 14 }} />}
                                                                    sx={{
                                                                        minHeight: 32,
                                                                        px: 0,
                                                                        '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' }
                                                                    }}
                                                                >
                                                                    <Checkbox
                                                                        size="small"
                                                                        checked={isMediumSelected}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={(e) => {
                                                                            const newMediums = e.target.checked
                                                                                ? [...(utm?.medium || []), medium]
                                                                                : (utm?.medium || []).filter(m => m !== medium);
                                                                            onUtmChange({ ...utm, medium: newMediums });
                                                                        }}
                                                                    />
                                                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: isMediumSelected ? 600 : 400 }}>{medium}</Typography>
                                                                </AccordionSummary>
                                                                <AccordionDetails sx={{ px: 2, pb: 1, pt: 0 }}>
                                                                    {Object.entries(mediumData.campaigns || {}).map(([campaign, campaignData]) => {
                                                                        const isCampaignSelected = (utm?.campaign || []).includes(campaign);
                                                                        return (
                                                                            <Accordion
                                                                                key={campaign}
                                                                                disableGutters
                                                                                elevation={0}
                                                                                sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}
                                                                            >
                                                                                <AccordionSummary
                                                                                    expandIcon={<ExpandMoreIcon sx={{ fontSize: 13 }} />}
                                                                                    sx={{
                                                                                        minHeight: 30,
                                                                                        px: 0,
                                                                                        '& .MuiAccordionSummary-content': { my: 0.5, alignItems: 'center' }
                                                                                    }}
                                                                                >
                                                                                    <Checkbox
                                                                                        size="small"
                                                                                        checked={isCampaignSelected}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        onChange={(e) => {
                                                                                            const newCampaigns = e.target.checked
                                                                                                ? [...(utm?.campaign || []), campaign]
                                                                                                : (utm?.campaign || []).filter(c => c !== campaign);
                                                                                            onUtmChange({ ...utm, campaign: newCampaigns });
                                                                                        }}
                                                                                    />
                                                                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: isCampaignSelected ? 600 : 400 }}>{campaign}</Typography>
                                                                                </AccordionSummary>
                                                                                <AccordionDetails sx={{ px: 2, pb: 1, pt: 0 }}>
                                                                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                                                        {campaignData.terms?.length > 0 && (
                                                                                            <Box>
                                                                                                <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Terms</Typography>
                                                                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                                                    {campaignData.terms.map(term => (
                                                                                                        <FormControlLabel
                                                                                                            key={term}
                                                                                                            control={
                                                                                                                <Checkbox
                                                                                                                    size="small"
                                                                                                                    checked={(utm?.term || []).includes(term)}
                                                                                                                    onChange={(e) => {
                                                                                                                        const next = e.target.checked
                                                                                                                            ? [...(utm?.term || []), term]
                                                                                                                            : (utm?.term || []).filter(x => x !== term);
                                                                                                                        onUtmChange({ ...utm, term: next });
                                                                                                                    }}
                                                                                                                />
                                                                                                            }
                                                                                                            label={<Typography sx={{ fontSize: '0.7rem' }}>{term}</Typography>}
                                                                                                            sx={{ ml: 0 }}
                                                                                                        />
                                                                                                    ))}
                                                                                                </Box>
                                                                                            </Box>
                                                                                        )}
                                                                                        {campaignData.contents?.length > 0 && (
                                                                                            <Box>
                                                                                                <Typography variant="overline" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Content</Typography>
                                                                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                                                    {campaignData.contents.map(ct => (
                                                                                                        <FormControlLabel
                                                                                                            key={ct}
                                                                                                            control={
                                                                                                                <Checkbox
                                                                                                                    size="small"
                                                                                                                    checked={(utm?.content || []).includes(ct)}
                                                                                                                    onChange={(e) => {
                                                                                                                        const next = e.target.checked
                                                                                                                            ? [...(utm?.content || []), ct]
                                                                                                                            : (utm?.content || []).filter(x => x !== ct);
                                                                                                                        onUtmChange({ ...utm, content: next });
                                                                                                                    }}
                                                                                                                />
                                                                                                            }
                                                                                                            label={<Typography sx={{ fontSize: '0.7rem' }}>{ct}</Typography>}
                                                                                                            sx={{ ml: 0 }}
                                                                                                        />
                                                                                                    ))}
                                                                                                </Box>
                                                                                            </Box>
                                                                                        )}
                                                                                    </Box>
                                                                                </AccordionDetails>
                                                                            </Accordion>
                                                                        );
                                                                    })}
                                                                </AccordionDetails>
                                                            </Accordion>
                                                        );
                                                    })}
                                                </AccordionDetails>
                                            </Accordion>
                                        );
                                    })}
                                </Box>
                            </AccordionDetails>
                        </Accordion>
                    )}
                </Box>

                <Box sx={{ p: 2, pt: 1, borderTop: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                    <Button
                        fullWidth
                        variant="outlined"
                        size="small"
                        onClick={() => {
                            onUtmChange({ source: [], medium: [], campaign: [], term: [], content: [] });
                            onSalesChannelChange('');
                            onProductChange(null);
                            handleFilterClose();
                        }}
                        sx={{
                            textTransform: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                            color: 'text.primary',
                            '&:hover': {
                                bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                                borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
                            }
                        }}
                    >
                        CLEAR ALL FILTERS
                    </Button>
                </Box>
            </Popover>
        </Box>
    );
}
