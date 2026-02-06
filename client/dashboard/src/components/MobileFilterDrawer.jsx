import { useState, useEffect, useMemo } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckIcon from '@mui/icons-material/Check';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import {
    Drawer,
    Box,
    Typography,
    Chip,
    Stack,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Autocomplete,
    TextField,
    Button,
    List,
    ListItemButton,
    ListItemText,
    Fade,
    Grow,
    Slide,
    Checkbox,
    CircularProgress
} from '@mui/material';
import { TransitionGroup } from 'react-transition-group';
import { GlassChip } from './ui/GlassChip';
import { getDashboardSummary, getProductTypes } from '../lib/api';

export default function MobileFilterDrawer({
    open,
    onClose,
    brands = [],
    brandKey,
    onBrandChange,
    productOptions = [],
    productValue,
    onProductChange,
    utm = {},
    onUtmChange,
    productTypes = [],
    onProductTypeChange,
    dateRange,
    isDark = false,
    showBrandFilter = true,
    showProductFilter = true,
    showUtmFilter = true,
    showProductTypeFilter = false
}) {
    // Local state for deferred application
    const [tempBrand, setTempBrand] = useState(brandKey);
    const [tempProduct, setTempProduct] = useState(productValue);
    const [tempUtm, setTempUtm] = useState(utm);
    const [tempProductTypes, setTempProductTypes] = useState(productTypes || []);
    const [availableProductTypes, setAvailableProductTypes] = useState([]);
    const [typesLoading, setTypesLoading] = useState(false);

    const [view, setView] = useState('ROOT'); // ROOT, BRAND, PRODUCT, UTM, UTM_SOURCE, UTM_MEDIUM, UTM_CAMPAIGN, PRODUCT_TYPE
    const [utmOptions, setUtmOptions] = useState(null);
    const [searchText, setSearchText] = useState('');

    useEffect(() => {
        setSearchText('');
    }, [view]);

    // Sync local state with props when drawer opens
    useEffect(() => {
        if (open) {
            setTempBrand(brandKey);
            setTempProduct(productValue);
            setTempUtm(utm);
            setTempProductTypes(productTypes || []);
            setView('ROOT');
        }
    }, [open]);

    // Fetch UTM options
    useEffect(() => {
        if (!open || !tempBrand || !showUtmFilter) return;

        const [start, end] = dateRange || [];
        const s = start?.format ? start.format('YYYY-MM-DD') : undefined;
        const e = end?.format ? end.format('YYYY-MM-DD') : undefined;

        getDashboardSummary({
            brand_key: tempBrand,
            start: s,
            end: e,
            include_utm_options: true,
            utm_source: tempUtm?.source,
            utm_medium: tempUtm?.medium,
            utm_campaign: tempUtm?.campaign
        }).then(res => {
            if (res.filter_options) setUtmOptions(res.filter_options);
        }).catch(err => console.error("Failed to load UTM options", err));

    }, [open, tempBrand, dateRange, tempUtm, view, showUtmFilter]);

    // Fetch Product Types
    useEffect(() => {
        if (!open || !tempBrand || !showProductTypeFilter) return;

        const [start, end] = dateRange || [];
        // Use end date for sync date reference as per valid logic
        const date = end?.format ? end.format('YYYY-MM-DD') : undefined;

        setTypesLoading(true);
        getProductTypes({
            brand_key: tempBrand,
            date
        }).then(res => {
            if (res.types) setAvailableProductTypes(res.types);
        }).finally(() => setTypesLoading(false));
    }, [open, tempBrand, dateRange, showProductTypeFilter]);

    const handleBack = () => {
        if (['BRAND', 'PRODUCT', 'UTM', 'PRODUCT_TYPE'].includes(view)) {
            setView('ROOT');
        } else if (['UTM_SOURCE', 'UTM_MEDIUM', 'UTM_CAMPAIGN'].includes(view)) {
            setView('UTM');
        } else {
            setView('ROOT');
        }
    };

    const getViewTitle = () => {
        switch (view) {
            case 'ROOT': return 'Filters';
            case 'BRAND': return 'Select Brand';
            case 'PRODUCT': return 'Select Product';
            case 'PRODUCT_TYPE': return 'Product Type';
            case 'UTM': return 'UTM Parameters';
            case 'UTM_SOURCE': return 'Source';
            case 'UTM_MEDIUM': return 'Medium';
            case 'UTM_CAMPAIGN': return 'Campaign';
            default: return 'Filters';
        }
    };

    const activeUtmCount = [tempUtm?.source, tempUtm?.medium, tempUtm?.campaign].map(v => {
        if (Array.isArray(v)) return v.length > 0;
        return !!v;
    }).filter(Boolean).length;

    const handleClearAll = () => {
        if (onUtmChange) onUtmChange({ source: '', medium: '', campaign: '' });
        if (onProductChange) onProductChange({ id: '', label: 'All products', detail: 'Whole store' });
        if (onProductTypeChange) onProductTypeChange([]);
        onClose();
    };

    const handleApply = () => {
        if (onBrandChange && tempBrand !== brandKey) onBrandChange(tempBrand);
        if (onProductChange) onProductChange(tempProduct);
        if (onUtmChange) onUtmChange(tempUtm);
        if (onProductTypeChange) onProductTypeChange(tempProductTypes);
        onClose();
    };

    // Product Type Logic
    const isAllTypesSelected = useMemo(() => {
        if (availableProductTypes.length === 0) return false;
        return tempProductTypes.length === availableProductTypes.length;
    }, [tempProductTypes, availableProductTypes]);

    const isIndeterminateTypes = useMemo(() => {
        return tempProductTypes.length > 0 && tempProductTypes.length < availableProductTypes.length;
    }, [tempProductTypes, availableProductTypes]);

    const handleToggleType = (type) => {
        if (tempProductTypes.includes(type)) {
            setTempProductTypes(prev => prev.filter(t => t !== type));
        } else {
            setTempProductTypes(prev => [...prev, type]);
        }
    };

    const handleToggleAllTypes = () => {
        if (isAllTypesSelected) {
            setTempProductTypes([]);
        } else {
            setTempProductTypes([...availableProductTypes]);
        }
    };

    return (
        <Drawer
            anchor="bottom"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    height: '60vh',
                    maxHeight: '85vh',
                    bgcolor: 'transparent',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            {/* Active Filters List (Scrollable) - Shows COMMITTED filters (props) */}
            {((productValue?.id && productValue.id !== '') || utm?.source || utm?.medium || utm?.campaign || (productTypes && productTypes.length > 0)) && (
                <Fade in={true} timeout={500}>
                    <Box
                        sx={{
                            width: '100%',
                            overflowX: 'auto',
                            bgcolor: 'transparent',
                            py: 1,
                            scrollbarWidth: 'none',
                            '&::-webkit-scrollbar': { display: 'none' }
                        }}
                    >
                        <Box sx={{ display: 'flex', gap: 1, px: 2, alignItems: 'center', minWidth: 'max-content' }}>
                            {/* Product Chip */}
                            {(productValue?.id && productValue.id !== '') && (
                                <Grow in={true}>
                                    <div>
                                        <GlassChip
                                            label={`Product: ${productValue.label}`}
                                            onDelete={() => {
                                                if (onProductChange) onProductChange({ id: '', label: 'All products', detail: 'Whole store' });
                                                setTempProduct({ id: '', label: 'All products', detail: 'Whole store' });
                                            }}
                                            size="small"
                                            isDark={isDark}
                                            sx={{ borderRadius: '9999px' }}
                                        />
                                    </div>
                                </Grow>
                            )}
                            {/* Product Type Chip */}
                            {productTypes && productTypes.length > 0 && (
                                <Grow in={true}>
                                    <div>
                                        <GlassChip
                                            label={`Types: ${productTypes.length} selected`}
                                            onDelete={() => {
                                                if (onProductTypeChange) onProductTypeChange([]);
                                                setTempProductTypes([]);
                                            }}
                                            size="small"
                                            isDark={isDark}
                                            sx={{ borderRadius: '9999px' }}
                                        />
                                    </div>
                                </Grow>
                            )}
                            {/* UTM Chips */}
                            {['source', 'medium', 'campaign'].map(field => {
                                const val = utm?.[field];
                                if (!val || (Array.isArray(val) && val.length === 0)) return null;
                                return (
                                    <Grow key={field} in={true}>
                                        <div>
                                            <GlassChip
                                                label={`${field.charAt(0).toUpperCase() + field.slice(1)}: ${Array.isArray(val) ? val.join(', ') : val}`}
                                                onDelete={() => {
                                                    const update = { ...utm, [field]: '' };
                                                    if (onUtmChange) onUtmChange(update);
                                                    setTempUtm(update);
                                                }}
                                                size="small"
                                                isDark={isDark}
                                                sx={{ borderRadius: '9999px' }}
                                            />
                                        </div>
                                    </Grow>
                                )
                            })}
                        </Box>
                    </Box>
                </Fade>
            )}

            {/* Header */}
            <Box sx={{
                p: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: isDark ? '#1a1a1a' : '#ffffff',
                position: 'sticky',
                top: 0,
                zIndex: 10
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {view !== 'ROOT' && (
                        <IconButton onClick={handleBack} size="small" edge="start">
                            <ArrowBackIcon fontSize="small" />
                        </IconButton>
                    )}
                    <Typography variant="h6" fontSize={16} fontWeight={600}>
                        {getViewTitle()}
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* Content */}
            <Box sx={{ p: 0, overflowY: 'auto', flex: 1, bgcolor: isDark ? '#1a1a1a' : '#ffffff', position: 'relative' }}>

                {/* ANIMATED VIEWS */}
                <Box key={view} sx={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                    <style>
                        {`
                            @keyframes fadeIn {
                                from { opacity: 0; transform: translateX(10px); }
                                to { opacity: 1; transform: translateX(0); }
                            }
                        `}
                    </style>

                    {/* ROOT VIEW */}
                    {view === 'ROOT' && (
                        <List disablePadding>
                            {/* Brand Item */}
                            {showBrandFilter && (
                                <ListItemButton
                                    onClick={() => setView('BRAND')}
                                    sx={{ py: 2, justifyContent: 'space-between' }}
                                    divider
                                >
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Brand</Typography>
                                        <Typography variant="body1" fontSize={14} fontWeight={500}>{tempBrand || 'Select Brand'}</Typography>
                                    </Box>
                                    <ChevronRightIcon color="action" />
                                </ListItemButton>
                            )}

                            {/* Product Item */}
                            {showProductFilter && (
                                <ListItemButton
                                    onClick={() => setView('PRODUCT')}
                                    sx={{ py: 2, justifyContent: 'space-between' }}
                                    divider
                                >
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Product</Typography>
                                        <Typography variant="body1" fontSize={14} fontWeight={500}>
                                            {tempProduct?.label || 'All products'}
                                        </Typography>
                                    </Box>
                                    <ChevronRightIcon color="action" />
                                </ListItemButton>
                            )}

                            {/* Product Type Item (New) */}
                            {showProductTypeFilter && (
                                <ListItemButton
                                    onClick={() => setView('PRODUCT_TYPE')}
                                    sx={{ py: 2, justifyContent: 'space-between' }}
                                    divider
                                >
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>Product Type</Typography>
                                        <Typography variant="body1" fontSize={14} fontWeight={500}>
                                            {tempProductTypes.length > 0 ? `${tempProductTypes.length} selected` : 'All types'}
                                        </Typography>
                                    </Box>
                                    <ChevronRightIcon color="action" />
                                </ListItemButton>
                            )}

                            {/* UTM Item */}
                            {showUtmFilter && (
                                <ListItemButton
                                    onClick={() => setView('UTM')}
                                    sx={{ py: 2, justifyContent: 'space-between' }}
                                >
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>UTM Parameters</Typography>
                                        <Typography variant="body1" fontSize={14} fontWeight={500}>
                                            {activeUtmCount > 0 ? `${activeUtmCount} Active` : 'All'}
                                        </Typography>
                                    </Box>
                                    <ChevronRightIcon color="action" />
                                </ListItemButton>
                            )}
                        </List>
                    )}

                    {/* BRAND VIEW */}
                    {view === 'BRAND' && (
                        <List disablePadding>
                            {(brands || []).map((b) => (
                                <ListItemButton
                                    key={b.key}
                                    onClick={() => {
                                        setTempBrand(b.key);
                                        handleBack();
                                    }}
                                    selected={tempBrand === b.key}
                                    sx={{ py: 1.5 }}
                                >
                                    <ListItemText primary={b.key} primaryTypographyProps={{ fontWeight: tempBrand === b.key ? 600 : 400 }} />
                                    {tempBrand === b.key && <CheckIcon fontSize="small" color="primary" />}
                                </ListItemButton>
                            ))}
                        </List>
                    )}

                    {/* PRODUCT VIEW */}
                    {view === 'PRODUCT' && (
                        <Box>
                            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 5 }}>
                                <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="Search products..."
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    autoFocus
                                />
                            </Box>
                            <List disablePadding>
                                {productOptions.filter(opt => !searchText || (opt.label || '').toLowerCase().includes(searchText.toLowerCase())).map((opt) => {
                                    const isSelected = (tempProduct?.id || '') === (opt.id || '');
                                    return (
                                        <ListItemButton
                                            key={opt.id || 'all'}
                                            onClick={() => {
                                                setTempProduct(opt);
                                                handleBack();
                                            }}
                                            selected={isSelected}
                                            sx={{ py: 1.5 }}
                                        >
                                            <ListItemText
                                                primary={opt.id ? opt.label : 'All products'}
                                                secondary={opt.detail}
                                                primaryTypographyProps={{ fontWeight: isSelected ? 600 : 400, fontSize: 14 }}
                                                secondaryTypographyProps={{ fontSize: 12 }}
                                            />
                                            {isSelected && <CheckIcon fontSize="small" color="primary" />}
                                        </ListItemButton>
                                    );
                                })}
                            </List>
                        </Box>
                    )}

                    {/* PRODUCT TYPE VIEW */}
                    {view === 'PRODUCT_TYPE' && (
                        <Box>
                            {typesLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            ) : (
                                <List disablePadding>
                                    {/* Select All */}
                                    <ListItemButton onClick={handleToggleAllTypes} sx={{ py: 1.5 }}>
                                        <Checkbox
                                            checked={isAllTypesSelected && availableProductTypes.length > 0}
                                            indeterminate={isIndeterminateTypes}
                                            size="small"
                                            sx={{ p: 0.5, mr: 1 }}
                                        />
                                        <ListItemText
                                            primary="Select All"
                                            primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                                        />
                                    </ListItemButton>
                                    <Box sx={{ height: 1, bgcolor: 'divider', my: 0.5 }} />

                                    {/* Types List */}
                                    {availableProductTypes.map((type) => {
                                        const isSelected = tempProductTypes.includes(type);
                                        return (
                                            <ListItemButton key={type} onClick={() => handleToggleType(type)} sx={{ py: 0.5 }}>
                                                <Checkbox
                                                    checked={isSelected}
                                                    size="small"
                                                    sx={{ p: 0.5, mr: 1 }}
                                                />
                                                <ListItemText
                                                    primary={type}
                                                    primaryTypographyProps={{ fontSize: 14 }}
                                                />
                                            </ListItemButton>
                                        );
                                    })}
                                    {availableProductTypes.length === 0 && (
                                        <Box sx={{ p: 2, textAlign: 'center' }}>
                                            <Typography variant="body2" color="text.secondary">No product types found.</Typography>
                                        </Box>
                                    )}
                                </List>
                            )}
                        </Box>
                    )}

                    {/* UTM ROOT VIEW */}
                    {view === 'UTM' && (
                        <List disablePadding>
                            {['source', 'medium', 'campaign'].map((field, index) => (
                                <ListItemButton
                                    key={field}
                                    onClick={() => setView(`UTM_${field.toUpperCase()}`)}
                                    divider={index < 2}
                                    sx={{ py: 2, justifyContent: 'space-between' }}
                                >
                                    <Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize', fontSize: 12 }}>
                                            {field}
                                        </Typography>
                                        <Typography variant="body1" fontSize={14} fontWeight={500} noWrap>
                                            {(() => {
                                                const val = tempUtm?.[field];
                                                if (Array.isArray(val) && val.length > 0) return val.join(', ');
                                                if (val && !Array.isArray(val)) return val;
                                                return 'All';
                                            })()}
                                        </Typography>
                                    </Box>
                                    <ChevronRightIcon fontSize="small" color="action" />
                                </ListItemButton>
                            ))}
                        </List>
                    )}

                    {/* UTM OPTIONS VIEWS */}
                    {['UTM_SOURCE', 'UTM_MEDIUM', 'UTM_CAMPAIGN'].includes(view) && (
                        <Box>
                            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 5 }}>
                                <TextField
                                    size="small"
                                    fullWidth
                                    placeholder={`Search ${view.replace('UTM_', '').toLowerCase()}...`}
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    autoFocus
                                />
                            </Box>
                            <List disablePadding>
                                <ListItemButton
                                    onClick={() => {
                                        const field = view.replace('UTM_', '').toLowerCase();
                                        setTempUtm({ ...tempUtm, [field]: '' });
                                        // handleBack(); // Don't close on clear all in multi-select mode? Or maybe just clear selection.
                                        // Actually better UX: 'All' means clear current selection
                                    }}
                                    sx={{ py: 1.5 }}
                                >
                                    <Checkbox
                                        checked={!tempUtm?.[view.replace('UTM_', '').toLowerCase()] || (Array.isArray(tempUtm?.[view.replace('UTM_', '').toLowerCase()]) && tempUtm?.[view.replace('UTM_', '').toLowerCase()].length === 0)}
                                        size="small"
                                        sx={{ p: 0.5, mr: 1 }}
                                    />
                                    <ListItemText primary="All" />
                                </ListItemButton>
                                {(utmOptions?.[`utm_${view.replace('UTM_', '').toLowerCase()}`] || [])
                                    .filter(opt => !searchText || String(opt).toLowerCase().includes(searchText.toLowerCase()))
                                    .map(opt => {
                                        const field = view.replace('UTM_', '').toLowerCase();
                                        const current = tempUtm?.[field];
                                        const isSelected = Array.isArray(current)
                                            ? current.includes(opt)
                                            : current === opt;

                                        return (
                                            <ListItemButton
                                                key={opt}
                                                onClick={() => {
                                                    let newVal;
                                                    if (Array.isArray(current)) {
                                                        newVal = current.includes(opt)
                                                            ? current.filter(x => x !== opt)
                                                            : [...current, opt];
                                                    } else {
                                                        // Was string or null, now array
                                                        // If it was already this val (shouldn't happen if we strictly use arrays but for safety), toggle off
                                                        if (current === opt) newVal = [];
                                                        else newVal = current ? [current, opt] : [opt];
                                                    }
                                                    // Handle the case where user had single string selected before update
                                                    // If current was string and not equal to opt, we make it array [current, opt]

                                                    setTempUtm({ ...tempUtm, [field]: newVal });
                                                    // handleBack(); // Keep open for multi-select
                                                }}
                                                selected={isSelected}
                                                sx={{ py: 0.5 }} // denser
                                            >
                                                <Checkbox
                                                    checked={isSelected}
                                                    size="small"
                                                    sx={{ p: 0.5, mr: 1 }}
                                                />
                                                <ListItemText primary={opt} primaryTypographyProps={{ fontSize: 14, noWrap: true }} />
                                            </ListItemButton>
                                        );
                                    })}
                            </List>
                        </Box>
                    )}

                </Box>
            </Box>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, bgcolor: isDark ? '#1a1a1a' : '#ffffff' }}>
                <Button
                    fullWidth
                    variant="outlined"
                    color="inherit"
                    onClick={handleClearAll}
                    startIcon={<DeleteIcon />}
                    sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary' }}
                >
                    Clear
                </Button>
                <Button
                    fullWidth
                    variant="contained"
                    onClick={handleApply}
                    sx={{ textTransform: 'none' }}
                >
                    Apply
                </Button>
            </Box>
        </Drawer>
    );
}
