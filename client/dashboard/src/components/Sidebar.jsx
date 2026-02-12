import { useMemo } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  useTheme,
  useMediaQuery,
  Avatar,
} from '@mui/material';
import {
  LayoutGrid,
  ShieldCheck,
  Store,
  Table2,
  Bell,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DRAWER_WIDTH = 260;

const NAV_ITEMS = [
  {
    group: 'main',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { id: 'product-conversion', label: 'Product Conversion', icon: Table2 },
      { id: 'alerts', label: 'Alerts', icon: Bell },
    ]
  },
  {
    group: 'admin',
    items: [
      { id: 'access', label: 'Access Control', icon: ShieldCheck },
      { id: 'brands', label: 'Brand Setup', icon: Store },
    ]
  }
];

export default function Sidebar({
  open,
  onClose,
  activeTab,
  onTabChange,
  darkMode = false,
  user,
  onLogout,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const NavContent = () => (
    <div className={cn(
      "flex flex-col h-full bg-white dark:bg-zinc-950",
      !isMobile && "border-r border-zinc-200 dark:border-zinc-800"
    )}>
      {/* Header / Logo */}
      <div className="px-6 py-8 flex items-center justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#009688] rounded-md flex items-center justify-center text-white">
              <LayoutGrid size={20} />
            </div>
            <span className="text-2xl font-bold tracking-tight text-[#009688]">Datum</span>
          </div>
          <span className="text-[10px] font-bold tracking-widest text-[#111111] dark:text-zinc-400 mt-1 uppercase">Your Data. Decoded</span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-4 space-y-6 overflow-y-auto">
        {NAV_ITEMS.map((section, sIdx) => (
          <div key={section.group} className="space-y-1">
            {sIdx > 0 && <div className="my-4 border-t border-zinc-100 dark:border-zinc-800" />}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    if (isMobile) onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
                    isActive
                      ? "bg-black text-white dark:bg-white dark:text-black shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  )}
                >
                  <Icon size={18} className={isActive ? "text-white dark:text-black" : "text-zinc-400"} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Profile Section */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar
            src={user?.avatar_url || user?.picture || ""}
            alt={user?.name || user?.email || "User"}
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              bgcolor: darkMode ? '#27272a' : '#f4f4f5',
              color: darkMode ? '#a1a1aa' : '#71717a'
            }}
          />
          <div className="flex flex-col items-start text-left min-w-0">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate w-full uppercase">
              {user?.name || user?.email?.split('@')[0] || 'User'}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
              {user?.role || (user?.isAuthor ? 'Admin' : 'Viewer')}
            </span>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: 'none',
          },
        }}
      >
        <NavContent />
      </Drawer>
    );
  }

  return (
    <Box
      component="nav"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 1200,
      }}
    >
      <NavContent />
    </Box>
  );
}
