import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CirclePlus,
  ClipboardList,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addMerchantRequestComment,
  createMerchantRequest,
  deleteMerchantRequest,
  deleteBrandConfig,
  getMerchantRequest,
  linkBrandProject,
  listBrandConfigs,
  listMerchantRequests,
  listTodoistProjects,
  listTodoistUsers,
  reconcileMerchantRequests,
  triggerBrandProvision,
  updateBrandPriorityCaps,
  updateMerchantRequestAssignee,
  updateMerchantRequestDueDate,
  updateMerchantRequestDeadline,
  updateMerchantRequestStatus,
} from "../lib/api.js";

dayjs.extend(relativeTime);

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = [
  "submitted",
  "assigned",
  "done",
];

const STATUS_CONFIG = {
  submitted: {
    label: "Submitted",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  assigned: {
    label: "Assigned",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  done: {
    label: "Done",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
};

const PRIORITY_CONFIG = {
  urgent: {
    label: "Urgent",
    dotClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-l-red-500",
  },
  high: {
    label: "High",
    dotClass: "bg-orange-500",
    textClass: "text-orange-600 dark:text-orange-400",
    borderClass: "border-l-orange-500",
  },
  normal: {
    label: "Normal",
    dotClass: "bg-blue-500",
    textClass: "text-blue-600 dark:text-blue-400",
    borderClass: "border-l-blue-500",
  },
  low: {
    label: "Low",
    dotClass: "bg-gray-300 dark:bg-gray-600",
    textClass: "text-gray-500 dark:text-gray-400",
    borderClass: "border-l-gray-300 dark:border-l-gray-600",
  },
};

const EVENT_CONFIG = {
  request_created: {
    Icon: CirclePlus,
    color: "text-blue-500 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    label: "Request created",
  },
  request_imported: {
    Icon: CirclePlus,
    color: "text-blue-500 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    label: "Imported from Todoist",
  },
  status_changed: {
    Icon: RefreshCw,
    color: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/30",
    label: "Status changed",
  },
  assignment_changed: {
    Icon: UserCheck,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    label: "Assigned",
  },
  comment_added: {
    Icon: MessageSquare,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    label: "Comment",
  },
  due_date_changed: {
    Icon: CalendarDays,
    color: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-900/30",
    label: "Due date changed",
  },
  deadline_date_changed: {
    Icon: CalendarDays,
    color: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/30",
    label: "Deadline changed",
  },
  due_date_synced: {
    Icon: CalendarDays,
    color: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-900/30",
    label: "Due date synced",
  },
  deadline_synced: {
    Icon: CalendarDays,
    color: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/30",
    label: "Deadline synced",
  },
};

const TAB_FILTERS = [
  { id: "all", label: "All", statuses: null },
  { id: "submitted", label: "Submitted", statuses: ["submitted"] },
  { id: "assigned", label: "Assigned", statuses: ["assigned"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

const CATEGORIES = [
  "Design",
  "Data Analysis",
  "Development",
  "Issues",
  "Integrations",
  "Feature Request",
];

const DEFAULT_PRIORITY_CAPS = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 5,
};

// Glassy card surface matching the dashboard's MUI cards (rounded-2xl, subtle
// border + depth shadow, gentle hover-lift; dark = backdrop blur + white border).
const GLASS_CARD =
  "rounded-2xl border shadow-lg transition-all duration-200 " +
  "hover:-translate-y-0.5 hover:shadow-xl " +
  "dark:bg-white/[0.03] dark:backdrop-blur-md dark:border-white/10";

const defaultSocketUrl =
  window.location.hostname === "datum.trytechit.co"
    ? "https://api.trytechit.co"
    : window.location.origin;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl;

// ── Helpers ───────────────────────────────────────────────────────────────────

function syncProblem(req) {
  const s = req?.sync || {};
  return [
    s.todoist_task_status,
    s.todoist_assignment_status,
    s.todoist_status_status,
    s.todoist_due_date_status,
    s.todoist_deadline_status,
    s.todoist_comment_status,
  ].includes("failed");
}

function syncPending(req) {
  const s = req?.sync || {};
  return [
    s.todoist_task_status,
    s.todoist_assignment_status,
    s.todoist_status_status,
    s.todoist_due_date_status,
    s.todoist_deadline_status,
    s.todoist_comment_status,
  ].includes("pending");
}

function formatRequestError(data, fallback = "Failed to create request") {
  const error = data?.error;
  if (error === "priority_cap_reached") {
    const priority = PRIORITY_CONFIG[data?.priority]?.label || data?.priority || "this priority";
    const limit = Number(data?.limit ?? 0);
    const activeCount = Number(data?.active_count ?? limit);
    return `You already have ${activeCount} active ${priority.toLowerCase()} request${activeCount === 1 ? "" : "s"}. The limit is ${limit}. Please wait until one is marked done or choose another priority.`;
  }
  if (error === "invalid_category") return "Please select a valid category.";
  if (error === "invalid_priority") return "Please select a valid priority.";
  if (error === "title_required") return "Please enter a request title.";
  if (error === "invalid_due_date") return "Enter the due date as DD-MM-YYYY.";
  if (error === "invalid_deadline_date") return "Enter the deadline as DD-MM-YYYY.";
  return error || fallback;
}

function formatDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || "");
}

function parseDateOnly(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const displayMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = displayMatch
    ? { year: Number(displayMatch[3]), month: Number(displayMatch[2]), day: Number(displayMatch[1]) }
    : isoMatch
      ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
      : null;
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

// ── Atomic sub-components ─────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: "" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function PriorityDot({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full flex-shrink-0 mt-[3px]",
              cfg.dotClass,
            )}
          />
        </TooltipTrigger>
        <TooltipContent>{cfg.label} priority</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SyncIndicator({ request }) {
  const failed = syncProblem(request);
  const pending = !failed && syncPending(request);
  if (!failed && !pending) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
              failed
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {failed ? "Sync error" : "Syncing…"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {failed
            ? "One or more Todoist sync operations failed"
            : "Sync pending with Todoist"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Request list card ─────────────────────────────────────────────────────────

function RequestCard({ request, selected, onClick, showAssignee = false }) {
  const pCfg = PRIORITY_CONFIG[request.priority] || PRIORITY_CONFIG.normal;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-lg border border-l-[3px] border-border bg-card px-3 py-3 transition-all duration-150",
        pCfg.borderClass,
        selected
          ? "ring-1 ring-inset ring-primary/40 bg-primary/5 dark:bg-primary/10 shadow-sm"
          : "hover:bg-muted/40 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <PriorityDot priority={request.priority} />
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground line-clamp-1 leading-tight">
          {request.title}
        </span>
        <StatusBadge status={request.status} />
      </div>
      <div className="flex items-center gap-1.5 pl-3.5 flex-wrap">
        <span className="text-[11px] font-mono font-semibold tracking-wide text-foreground/60">
          {request.brand_key}
        </span>
        {showAssignee && request.assignee?.name && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground">
              {request.assignee.name}
            </span>
          </>
        )}
        <span className="text-muted-foreground/30">·</span>
        <span className="text-[11px] text-muted-foreground">
          {dayjs(request.updated_at).fromNow()}
        </span>
        {request.deadline_date && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <Clock className="h-3 w-3" />
              Deadline {formatDateOnly(request.deadline_date)}
            </span>
          </>
        )}
        {request.due_date && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              Due {formatDateOnly(request.due_date)}
            </span>
          </>
        )}
        <SyncIndicator request={request} />
      </div>
    </button>
  );
}

// ── Timeline event row ────────────────────────────────────────────────────────

function TimelineEvent({ event, isLast }) {
  const cfg = EVENT_CONFIG[event.type] || {
    Icon: Clock,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: event.type,
  };
  const { Icon } = cfg;
  const isComment = event.type === "comment_added";
  const actorName =
    event.actor?.name ||
    event.actor?.email ||
    (event.source === "todoist" ? "Todoist" : "System");
  const eventText =
    event.message ||
    (["deadline_date_changed", "deadline_synced"].includes(event.type)
      ? event.data?.deadline_date
        ? `Deadline set to ${formatDateOnly(event.data.deadline_date)}`
        : "Deadline cleared"
      : ["due_date_changed", "due_date_synced"].includes(event.type)
      ? event.data?.due_date
        ? `Due date set to ${formatDateOnly(event.data.due_date)}`
        : "Due date cleared"
      : event.data?.status
        ? `Status → ${STATUS_CONFIG[event.data.status]?.label || event.data.status}`
        : cfg.label);

  return (
    <div className="flex gap-3 min-w-0">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
            cfg.bg,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
        </span>
        {!isLast && <div className="mt-1 flex-1 w-px bg-border min-h-[12px]" />}
      </div>
      <div className={cn("min-w-0 flex-1", !isLast && "pb-4")}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-foreground truncate">
            {actorName}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            {dayjs(event.created_at).fromNow()}
          </span>
        </div>
        {isComment ? (
          <div className="rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-sm text-foreground/90 leading-relaxed">
            {event.message}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {eventText}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Loading skeletons ─────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-l-[3px] border-border p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full mt-0.5 flex-shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
          <div className="flex gap-2 pl-3.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="p-5 space-y-5">
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-20 rounded-md flex-shrink-0" />
        </div>
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-3.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="flex gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Brand settings dialog ─────────────────────────────────────────────────────

const PROVISION_STATUS_CONFIG = {
  ready: {
    label: "Ready",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  pending: {
    label: "Provisioning…",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
};

function BrandSettingsDialog({ open, onClose, availableBrands = [] }) {
  const [configs, setConfigs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [linkBrand, setLinkBrand] = useState(null);
  const [linkProjectId, setLinkProjectId] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [capDrafts, setCapDrafts] = useState({});
  // Add-brand form at the bottom
  const [addBrandKey, setAddBrandKey] = useState("");

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    const res = await listBrandConfigs();
    if (!res.error) {
      const nextConfigs = res.data?.configs || [];
      setConfigs(nextConfigs);
      setCapDrafts(
        nextConfigs.reduce((acc, cfg) => {
          acc[cfg.brand_key] = { ...DEFAULT_PRIORITY_CAPS, ...(cfg.priority_caps || {}) };
          return acc;
        }, {}),
      );
    }
    setLoading(false);
  }, []);

  const loadProjects = useCallback(async ({ refresh = false } = {}) => {
    setProjectsLoading(true);
    const res = await listTodoistProjects({ refresh });
    if (!res.error) setProjects(res.data?.projects || []);
    setProjectsLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadConfigs();
    loadProjects();
  }, [open, loadConfigs, loadProjects]);

  async function handleProvision(brand_key) {
    setActionLoading(`provision-${brand_key}`);
    await triggerBrandProvision(brand_key);
    setActionLoading("");
    setTimeout(loadConfigs, 1500);
  }

  async function handleDelete(brand_key) {
    if (!window.confirm(`Remove Todoist config for ${brand_key}? This will re-trigger auto-provisioning on the next request.`)) return;
    setActionLoading(`delete-${brand_key}`);
    await deleteBrandConfig(brand_key);
    setActionLoading("");
    loadConfigs();
  }

  async function handleLink() {
    if (!linkBrand || !linkProjectId.trim()) return;
    setLinkLoading(true);
    setLinkError("");
    const res = await linkBrandProject(linkBrand, linkProjectId.trim());
    setLinkLoading(false);
    if (res.error) {
      setLinkError(res.data?.error || "Failed to link project");
      return;
    }
    setLinkBrand(null);
    setLinkProjectId("");
    loadConfigs();
  }

  function handleCapChange(brandKey, priority, value) {
    const normalized = Math.max(0, Number(value || 0));
    setCapDrafts((drafts) => ({
      ...drafts,
      [brandKey]: {
        ...DEFAULT_PRIORITY_CAPS,
        ...(drafts[brandKey] || {}),
        [priority]: normalized,
      },
    }));
  }

  async function handleSavePriorityCaps(brandKey) {
    setActionLoading(`caps-${brandKey}`);
    await updateBrandPriorityCaps(brandKey, capDrafts[brandKey] || DEFAULT_PRIORITY_CAPS);
    setActionLoading("");
    loadConfigs();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Brand Todoist Config
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-lg bg-muted/60 dark:bg-muted/40 border border-border">
                <Building2 className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No brand configs yet. They are auto-created on the first request per brand.
                </p>
              </div>
            ) : (
              // Self-contained scroll region so the "Configure a Brand" panel
              // and footer stay reachable no matter how many brands are listed.
              <div className="flex flex-col gap-3 max-h-[42vh] overflow-y-auto rounded-lg border border-border bg-muted/20 dark:bg-muted/10 p-2">
                {configs.map((cfg) => {
                  const psCfg =
                    PROVISION_STATUS_CONFIG[cfg.provisioning_status] ||
                    PROVISION_STATUS_CONFIG.pending;
                  const isReady = cfg.provisioning_status === "ready";

                  return (
                    <div
                      key={cfg.brand_key}
                      className="rounded-lg border border-border bg-muted/60 dark:bg-muted/40 p-4 flex flex-col gap-3"
                    >
                      {/* Brand header row */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {cfg.brand_key}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                            psCfg.className,
                          )}
                        >
                          {psCfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {cfg.provisioning_mode === "manual" ? "Manual link" : "Auto-provisioned"}
                        </span>
                        {cfg.todoist_project_id && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded">
                            {cfg.todoist_project_id}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 ml-auto">
                          {!isReady && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={actionLoading === `provision-${cfg.brand_key}`}
                                onClick={() => handleProvision(cfg.brand_key)}
                              >
                                {actionLoading === `provision-${cfg.brand_key}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3" />
                                )}
                                Provision
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => { setLinkBrand(cfg.brand_key); setLinkProjectId(""); setLinkError(""); }}
                              >
                                <Link2 className="h-3 w-3" />
                                Link Project
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                            disabled={actionLoading === `delete-${cfg.brand_key}`}
                            onClick={() => handleDelete(cfg.brand_key)}
                          >
                            {actionLoading === `delete-${cfg.brand_key}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Priority caps (only when ready) */}
                      {isReady && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Active Request Caps
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {["urgent", "high", "normal", "low"].map((priority) => (
                              <label key={priority} className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                {PRIORITY_CONFIG[priority]?.label || priority}
                                <Input
                                  type="number"
                                  min="0"
                                  value={(capDrafts[cfg.brand_key] || DEFAULT_PRIORITY_CAPS)[priority]}
                                  onChange={(e) => handleCapChange(cfg.brand_key, priority, e.target.value)}
                                  className="mt-1 h-8 text-xs"
                                />
                              </label>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-7 text-xs"
                            disabled={actionLoading === `caps-${cfg.brand_key}`}
                            onClick={() => handleSavePriorityCaps(cfg.brand_key)}
                          >
                            {actionLoading === `caps-${cfg.brand_key}` && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            Save caps
                          </Button>
                        </div>
                      )}

                      {/* Provisioning error */}
                      {cfg.provisioning_error && (
                        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          {cfg.provisioning_error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add / configure a brand manually */}
          <div className="rounded-lg bg-muted/60 dark:bg-muted/40 border border-border p-4 flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configure a Brand
            </p>
            <div className="flex gap-2 items-center">
              {availableBrands.length > 0 ? (
                <Select
                  value={addBrandKey}
                  onValueChange={setAddBrandKey}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Select brand…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBrands.map((b) => (
                      <SelectItem key={b.key} value={b.key} className="text-sm">
                        {b.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Brand key (e.g. TMC)"
                  value={addBrandKey}
                  onChange={(e) => setAddBrandKey(e.target.value.toUpperCase())}
                  className="h-8 text-sm font-mono flex-1"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 flex-shrink-0"
                disabled={!addBrandKey.trim() || actionLoading === `provision-${addBrandKey}`}
                onClick={async () => {
                  await handleProvision(addBrandKey.trim());
                  setAddBrandKey("");
                }}
              >
                {actionLoading === `provision-${addBrandKey}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                Auto-Provision
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 flex-shrink-0"
                disabled={!addBrandKey.trim()}
                onClick={() => {
                  setLinkBrand(addBrandKey.trim());
                  setLinkProjectId("");
                  setLinkError("");
                  setAddBrandKey("");
                }}
              >
                <Link2 className="h-3 w-3" />
                Link Project
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Auto-Provision creates a new Todoist project. Link Project connects an existing one.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link project sub-dialog */}
      <Dialog open={!!linkBrand} onOpenChange={(v) => !v && setLinkBrand(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Link Todoist Project — {linkBrand}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Todoist Project
                </label>
                <button
                  type="button"
                  onClick={() => loadProjects({ refresh: true })}
                  disabled={projectsLoading}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn("h-3 w-3", projectsLoading && "animate-spin")}
                  />
                  Refresh
                </button>
              </div>
              {projects.length > 0 ? (
                <Select
                  value={linkProjectId}
                  onValueChange={setLinkProjectId}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-sm">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Paste Todoist project ID…"
                  value={linkProjectId}
                  onChange={(e) => setLinkProjectId(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              )}
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Sections will be auto-matched by name. Missing sections will be created.
              </p>
            </div>
            {linkError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {linkError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkBrand(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!linkProjectId.trim() || linkLoading}
              onClick={handleLink}
            >
              {linkLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Link Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function MerchantRequestsPanel({
  brandKey,
  isAuthor = false,
  availableBrands = [],
}) {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [todoistUsers, setTodoistUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterBrand, setFilterBrand] = useState(brandKey || "");
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Feature Request",
    priority: "normal",
    due_date: "",
    deadline_date: "",
  });
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [comment, setComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [brandSettingsOpen, setBrandSettingsOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [assigneeUpdating, setAssigneeUpdating] = useState(false);
  const [dueDateUpdating, setDueDateUpdating] = useState(false);
  const [dueDateValue, setDueDateValue] = useState("");
  const [deadlineUpdating, setDeadlineUpdating] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState("");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const commentRef = useRef(null);
  const selectedIdRef = useRef("");

  // ── Computed ────────────────────────────────────────────────────────────────

  const activeBrand = isAuthor ? filterBrand : brandKey || "";

  const filteredRequests = useMemo(() => {
    const tabCfg = TAB_FILTERS.find((t) => t.id === activeTab) || TAB_FILTERS[0];
    return requests.filter((req) => {
      if (tabCfg.statuses && !tabCfg.statuses.includes(req.status)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          req.title.toLowerCase().includes(q) ||
          req.brand_key.toLowerCase().includes(q) ||
          (req.requester?.email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [requests, activeTab, searchQuery]);

  const tabCounts = useMemo(() => {
    return TAB_FILTERS.reduce((acc, tab) => {
      acc[tab.id] = tab.statuses
        ? requests.filter((r) => tab.statuses.includes(r.status)).length
        : requests.length;
      return acc;
    }, {});
  }, [requests]);

  const openCount = useMemo(
    () =>
      requests.filter((r) => r.status !== "done")
        .length,
    [requests],
  );

  const selectedRequest = useMemo(
    () =>
      selectedDetail?.request ||
      requests.find((r) => r.id === selectedId),
    [requests, selectedDetail, selectedId],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // ── Window resize ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchRequests = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const params = {};
    if (activeBrand) params.brand_key = activeBrand;
    try {
      const res = await listMerchantRequests(params);
      if (res.error) {
        setError(res.data?.error || "Failed to load requests");
      } else {
        setError("");
        setRequests(res.data?.requests || []);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeBrand]);

  const fetchDetail = useCallback(async (id, { silent = false } = {}) => {
    if (!id) {
      setSelectedDetail(null);
      return;
    }
    if (!silent) setDetailLoading(true);
    try {
      const res = await getMerchantRequest(id);
      if (!res.error) {
        setSelectedDetail(res.data);
      } else if (res.status === 404 && selectedIdRef.current === id) {
        setSelectedId("");
        setSelectedDetail(null);
        setMobileShowDetail(false);
      }
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setSelectedDetail(null);
  }, [fetchDetail, selectedId]);

  useEffect(() => {
    setDueDateValue(formatDateOnly(selectedRequest?.due_date));
  }, [selectedRequest?.id, selectedRequest?.due_date]);

  useEffect(() => {
    setDeadlineValue(formatDateOnly(selectedRequest?.deadline_date));
  }, [selectedRequest?.id, selectedRequest?.deadline_date]);

  useEffect(() => {
    if (!isAuthor) return;
    listTodoistUsers().then((res) => {
      if (!res.error) setTodoistUsers(res.data?.users || []);
    });
  }, [isAuthor]);

  // ── Socket.IO + polling ──────────────────────────────────────────────────────

  useEffect(() => {
    const token = window.localStorage.getItem("gateway_access_token");
    if (!token) return;

    const socket = io(SOCKET_URL, {
      path: "/api/merchant-requests/socket.io",
      auth: { token },
      transports: ["polling", "websocket"],
    });

    const refreshCurrent = () => {
      fetchRequests({ silent: true });
      const currentId = selectedIdRef.current;
      if (currentId) fetchDetail(currentId, { silent: true });
    };

    const refresh = (payload) => {
      if (payload?.request_id && payload.request_id === selectedIdRef.current) {
        fetchDetail(payload.request_id, { silent: true });
      }
      fetchRequests({ silent: true });
    };

    const removeRequest = (payload) => {
      if (payload?.request_id && payload.request_id === selectedIdRef.current) {
        setSelectedId("");
        setSelectedDetail(null);
        setMobileShowDetail(false);
      }
      fetchRequests({ silent: true });
    };

    const updateReconnectAuth = () => {
      socket.auth = {
        token: window.localStorage.getItem("gateway_access_token") || "",
      };
    };

    const reconnectWithLatestAuth = () => {
      updateReconnectAuth();
      if (!socket.connected) socket.connect();
    };

    const handleTokenStorageChange = (event) => {
      if (event.key === "gateway_access_token" && event.newValue) {
        reconnectWithLatestAuth();
      }
    };

    const handleConnectError = (err) => {
      console.warn("[merchant-requests] realtime connection failed", err?.message || err);
    };

    const handleDisconnect = (reason) => {
      console.warn("[merchant-requests] realtime disconnected", reason);
    };

    socket.on("connect", refreshCurrent);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("merchant-request:created", refresh);
    socket.on("merchant-request:updated", refresh);
    socket.on("merchant-request:commented", refresh);
    socket.on("merchant-request:sync_failed", refresh);
    socket.on("merchant-request:removed", removeRequest);
    socket.io.on("reconnect_attempt", updateReconnectAuth);
    window.addEventListener("auth:token-refreshed", reconnectWithLatestAuth);
    window.addEventListener("storage", handleTokenStorageChange);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshCurrent();
      }
    }, 45000);
    return () => {
      clearInterval(poll);
      socket.io.off("reconnect_attempt", updateReconnectAuth);
      window.removeEventListener("auth:token-refreshed", reconnectWithLatestAuth);
      window.removeEventListener("storage", handleTokenStorageChange);
      socket.off("connect", refreshCurrent);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("merchant-request:created", refresh);
      socket.off("merchant-request:updated", refresh);
      socket.off("merchant-request:commented", refresh);
      socket.off("merchant-request:sync_failed", refresh);
      socket.off("merchant-request:removed", removeRequest);
      socket.disconnect();
    };
  }, [fetchDetail, fetchRequests]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function selectRequest(id) {
    setSelectedId(id);
    if (isMobile) setMobileShowDetail(true);
  }

  function handleBackToList() {
    setMobileShowDetail(false);
    setSelectedId("");
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (!activeBrand) {
      setFormError("Brand is required");
      return;
    }
    setFormError("");
    setFormSubmitting(true);
    const payload = { ...form, brand_key: activeBrand };
    if (isAuthor) {
      const dueDate = parseDateOnly(form.due_date);
      const deadlineDate = parseDateOnly(form.deadline_date);
      if (dueDate === null || deadlineDate === null) {
        setFormSubmitting(false);
        setFormError("Enter dates as DD-MM-YYYY.");
        return;
      }
      payload.due_date = dueDate;
      payload.deadline_date = deadlineDate;
    } else {
      delete payload.due_date;
      delete payload.deadline_date;
    }
    const res = await createMerchantRequest(payload);
    setFormSubmitting(false);
    if (res.error) {
      setFormError(formatRequestError(res.data));
      return;
    }
    setForm({
      title: "",
      description: "",
      category: "Feature Request",
      priority: "normal",
      due_date: "",
      deadline_date: "",
    });
    setNewRequestOpen(false);
    const newId = res.data?.request?.id || "";
    if (newId) {
      setSelectedId(newId);
      if (isMobile) setMobileShowDetail(true);
    }
    fetchRequests({ silent: true });
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!selectedId || !comment.trim()) return;
    setCommentSubmitting(true);
    const res = await addMerchantRequestComment(selectedId, comment.trim());
    setCommentSubmitting(false);
    if (!res.error) {
      setComment("");
      setSelectedDetail(res.data);
      fetchRequests({ silent: true });
    }
  }

  async function changeStatus(status) {
    if (!selectedId) return;
    setStatusUpdating(true);
    const res = await updateMerchantRequestStatus(selectedId, status);
    setStatusUpdating(false);
    if (!res.error) {
      fetchDetail(selectedId, { silent: true });
      fetchRequests({ silent: true });
    }
  }

  async function changeAssignee(todoistUserId) {
    if (!selectedId) return;
    setAssigneeUpdating(true);
    const res = await updateMerchantRequestAssignee(selectedId, todoistUserId);
    setAssigneeUpdating(false);
    if (!res.error) {
      fetchDetail(selectedId, { silent: true });
      fetchRequests({ silent: true });
    }
  }

  async function saveDueDate(nextDueDate = dueDateValue) {
    if (!selectedId || !isAuthor) return;
    const normalized = parseDateOnly(nextDueDate);
    if (normalized === null) {
      setError("Enter the due date as DD-MM-YYYY.");
      return;
    }
    setDueDateUpdating(true);
    const res = await updateMerchantRequestDueDate(selectedId, normalized);
    setDueDateUpdating(false);
    if (!res.error) {
      setError("");
      setDueDateValue(formatDateOnly(res.data?.request?.due_date));
      fetchDetail(selectedId, { silent: true });
      fetchRequests({ silent: true });
    } else {
      setError(formatRequestError(res.data, "Failed to update due date"));
    }
  }

  async function saveDeadline(nextDeadline = deadlineValue) {
    if (!selectedId || !isAuthor) return;
    const normalized = parseDateOnly(nextDeadline);
    if (normalized === null) {
      setError("Enter the deadline as DD-MM-YYYY.");
      return;
    }
    setDeadlineUpdating(true);
    const res = await updateMerchantRequestDeadline(selectedId, normalized);
    setDeadlineUpdating(false);
    if (!res.error) {
      setError("");
      setDeadlineValue(formatDateOnly(res.data?.request?.deadline_date));
      fetchDetail(selectedId, { silent: true });
      fetchRequests({ silent: true });
    } else {
      setError(formatRequestError(res.data, "Failed to update deadline"));
    }
  }

  async function confirmRemoveRequest() {
    if (!selectedId || !isAuthor) return;
    setRemoveSubmitting(true);
    setRemoveError("");
    const res = await deleteMerchantRequest(selectedId);
    setRemoveSubmitting(false);
    if (res.error) {
      setRemoveError(res.data?.error || "Failed to remove request");
      return;
    }
    setRemoveDialogOpen(false);
    setSelectedId("");
    setSelectedDetail(null);
    setMobileShowDetail(false);
    fetchRequests({ silent: true });
  }

  async function handleReconcile() {
    setReconciling(true);
    await reconcileMerchantRequests();
    setReconciling(false);
    fetchRequests({ silent: true });
  }

  // ── Layout flags ─────────────────────────────────────────────────────────────

  const showList = !isMobile || !mobileShowDetail;
  const showDetail = !isMobile || mobileShowDetail;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground leading-tight">
              Merchant Requests
            </h2>
            <p className="text-xs text-muted-foreground">
              Track and manage merchant service requests
            </p>
          </div>
          {openCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-bold text-primary">
              {openCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAuthor && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBrandSettingsOpen(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-4 w-4 mr-1.5" />
                Brand Config
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReconcile}
                disabled={reconciling}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={cn("h-4 w-4 mr-1.5", reconciling && "animate-spin")}
                />
                Reconcile
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setNewRequestOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Request
          </Button>
        </div>
      </div>

      {/* Status tab filter */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8 gap-0.5 overflow-x-auto w-full sm:w-auto">
          {TAB_FILTERS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-7 px-2.5 text-xs gap-1.5 flex-shrink-0"
            >
              {tab.label}
              {tabCounts[tab.id] > 0 && (
                <span
                  className={cn(
                    "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                    activeTab === tab.id
                      ? "bg-primary/20 text-primary"
                      : "bg-muted-foreground/20 text-foreground/70",
                  )}
                >
                  {tabCounts[tab.id]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Main two-column layout */}
      <div className="flex gap-4 items-start">

        {/* Left: request list */}
        {showList && (
          <Card
            className={cn(
              GLASS_CARD,
              "flex flex-col gap-0 overflow-hidden",
              !isMobile ? "w-[380px] flex-shrink-0" : "w-full",
            )}
          >
            <CardContent className="p-3 flex flex-col gap-3">
              {/* Filters */}
              <div className="flex gap-2">
                <Input
                  placeholder="Search requests…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                />
                {isAuthor && availableBrands.length > 0 && (
                  <Select
                    value={filterBrand || "__all__"}
                    onValueChange={(v) =>
                      setFilterBrand(v === "__all__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-8 w-[110px] text-xs flex-shrink-0">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All brands</SelectItem>
                      {availableBrands.map((b) => (
                        <SelectItem key={b.key} value={b.key}>
                          {b.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* List */}
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[580px]">
                {loading ? (
                  <ListSkeleton />
                ) : filteredRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <ClipboardList className="h-10 w-10 text-muted-foreground/25 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">
                      No requests found
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeTab !== "all"
                        ? "Try a different filter"
                        : "Submit a new request to get started"}
                    </p>
                  </div>
                ) : (
                  filteredRequests.map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      selected={req.id === selectedId}
                      onClick={() => selectRequest(req.id)}
                      showAssignee={isAuthor}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Right: detail panel */}
        {showDetail && (
          <Card className={cn(GLASS_CARD, "flex-1 min-w-0 overflow-hidden")}>
            <CardContent className="p-0">
              {/* Mobile back button */}
              {isMobile && (
                <div className="px-5 pt-4 pb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-1.5"
                    onClick={handleBackToList}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    All requests
                  </Button>
                </div>
              )}

              {!selectedRequest ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 mb-3">
                    <ClipboardList className="h-7 w-7 text-muted-foreground/35" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Select a request
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose a request from the list to view details and timeline
                  </p>
                </div>
              ) : detailLoading ? (
                <DetailSkeleton />
              ) : (
                <div className="overflow-y-auto max-h-[680px]">
                  {/* Detail header */}
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-start gap-3 mb-2">
                      <h3 className="flex-1 min-w-0 text-base font-bold text-foreground leading-snug">
                        {selectedRequest.title}
                      </h3>
                      {isAuthor && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Remove request"
                          onClick={() => {
                            setRemoveError("");
                            setRemoveDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <StatusBadge status={selectedRequest.status} />
                    </div>

                    {selectedRequest.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                        {selectedRequest.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-[11px] text-foreground/70">
                        {selectedRequest.brand_key}
                      </span>
                      <span
                        className={cn(
                          "font-semibold text-[11px]",
                          (PRIORITY_CONFIG[selectedRequest.priority] || PRIORITY_CONFIG.normal).textClass,
                        )}
                      >
                        {(PRIORITY_CONFIG[selectedRequest.priority] || PRIORITY_CONFIG.normal).label}
                      </span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="text-muted-foreground text-[11px]">
                        by{" "}
                        {selectedRequest.requester?.name ||
                          selectedRequest.requester?.email ||
                          "Unknown"}
                      </span>
                      {isAuthor && selectedRequest.assignee?.name && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-muted-foreground text-[11px]">
                            → {selectedRequest.assignee.name}
                          </span>
                        </>
                      )}
                      {selectedRequest.category && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-muted-foreground text-[11px]">
                            {selectedRequest.category}
                          </span>
                        </>
                      )}
                      {selectedRequest.due_date && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
                            <Clock className="h-3 w-3" />
                            Due date: {formatDateOnly(selectedRequest.due_date)}
                          </span>
                        </>
                      )}
                      {selectedRequest.deadline_date && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-[11px] font-medium">
                            <CalendarDays className="h-3 w-3" />
                            Deadline: {formatDateOnly(selectedRequest.deadline_date)}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <SyncIndicator request={selectedRequest} />
                      {isAuthor && selectedRequest.todoist_url && (
                        <a
                          href={selectedRequest.todoist_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open in Todoist
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Admin controls */}
                  {isAuthor && (
                    <>
                      <Separator />
                      <div className="px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Manage
                        </p>
                        <div className="flex gap-3 flex-col sm:flex-row">
                          <div className="flex-1">
                            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                              Status
                            </label>
                            <Select
                              value={selectedRequest.status || ""}
                              onValueChange={changeStatus}
                              disabled={statusUpdating}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                {statusUpdating ? (
                                  <span className="flex items-center gap-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Updating…
                                  </span>
                                ) : (
                                  <SelectValue />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {STATUS_CONFIG[s]?.label || s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                              Assignee
                            </label>
                            <Select
                              value={
                                selectedRequest.assignee?.todoist_user_id || ""
                              }
                              onValueChange={changeAssignee}
                              disabled={assigneeUpdating}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                {assigneeUpdating ? (
                                  <span className="flex items-center gap-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Updating…
                                  </span>
                                ) : (
                                  <SelectValue placeholder="Unassigned" />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                {todoistUsers.map((u) => (
                                  <SelectItem
                                    key={u.todoist_user_id}
                                    value={u.todoist_user_id}
                                    className="text-xs"
                                  >
                                    {u.name || u.email || u.todoist_user_id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                            Due date
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="DD-MM-YYYY"
                              value={dueDateValue}
                              onChange={(e) => setDueDateValue(e.target.value)}
                              className="h-8 text-xs sm:max-w-[180px]"
                              disabled={dueDateUpdating}
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => saveDueDate()}
                                disabled={
                                  dueDateUpdating ||
                                  dueDateValue === formatDateOnly(selectedRequest.due_date)
                                }
                                className="h-8 text-xs"
                              >
                                {dueDateUpdating && (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                )}
                                Save
                              </Button>
                              {selectedRequest.due_date && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => saveDueDate("")}
                                  disabled={dueDateUpdating}
                                  className="h-8 text-xs text-muted-foreground"
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
                            Deadline
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="DD-MM-YYYY"
                              value={deadlineValue}
                              onChange={(e) => setDeadlineValue(e.target.value)}
                              className="h-8 text-xs sm:max-w-[180px]"
                              disabled={deadlineUpdating}
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => saveDeadline()}
                                disabled={
                                  deadlineUpdating ||
                                  deadlineValue === formatDateOnly(selectedRequest.deadline_date)
                                }
                                className="h-8 text-xs"
                              >
                                {deadlineUpdating && (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                )}
                                Save
                              </Button>
                              {selectedRequest.deadline_date && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => saveDeadline("")}
                                  disabled={deadlineUpdating}
                                  className="h-8 text-xs text-muted-foreground"
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Timeline */}
                  {!selectedDetail?.timeline_hidden && (
                    <>
                      <Separator />
                      <div className="px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                          Timeline
                        </p>
                        {(selectedDetail?.events || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            No activity yet.
                          </p>
                        ) : (
                          <div>
                            {(selectedDetail?.events || []).map((event, idx) => (
                              <TimelineEvent
                                key={event._id}
                                event={event}
                                isLast={
                                  idx === (selectedDetail?.events || []).length - 1
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {isAuthor && (
                    <>
                      {/* Comment form */}
                      <Separator />
                      <div className="px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Add Comment
                        </p>
                        <form onSubmit={submitComment} className="flex flex-col gap-2">
                          <textarea
                            ref={commentRef}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Write a comment…"
                            rows={3}
                            className={cn(
                              "flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm transition-colors",
                              "placeholder:text-muted-foreground",
                              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                              "disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                            )}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={!comment.trim() || commentSubmitting}
                            className="self-end"
                          >
                            {commentSubmitting && (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            )}
                            Post Comment
                          </Button>
                        </form>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Brand settings dialog (author-only) */}
      {isAuthor && (
        <BrandSettingsDialog
          open={brandSettingsOpen}
          onClose={() => setBrandSettingsOpen(false)}
          availableBrands={availableBrands}
        />
      )}

      {/* New Request Dialog */}
      <Dialog open={newRequestOpen} onOpenChange={setNewRequestOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>New Merchant Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRequest} className="flex flex-col gap-3.5 pt-1">
            {isAuthor && availableBrands.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Brand
                </label>
                <Select
                  value={filterBrand || ""}
                  onValueChange={setFilterBrand}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select brand…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBrands.map((b) => (
                      <SelectItem key={b.key} value={b.key}>
                        {b.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="What do you need help with?"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="h-9 text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Description
              </label>
              <textarea
                placeholder="Provide more context or details…"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                className={cn(
                  "flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm shadow-sm transition-colors",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50 resize-none",
                )}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Category
                </label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[130px]">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Priority
                </label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isAuthor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Due date
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD-MM-YYYY"
                    value={form.due_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, due_date: e.target.value }))
                    }
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Deadline
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD-MM-YYYY"
                    value={form.deadline_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, deadline_date: e.target.value }))
                    }
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            )}

            {formError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNewRequestOpen(false);
                  setFormError("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={formSubmitting || !form.title.trim()}
              >
                {formSubmitting && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeDialogOpen}
        onOpenChange={(open) => {
          if (removeSubmitting) return;
          setRemoveDialogOpen(open);
          if (!open) setRemoveError("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this request?</DialogTitle>
            <DialogDescription>
              The request will be hidden from the panel but retained in request history. Its Todoist task will not be deleted.
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {removeError}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={removeSubmitting}
              onClick={() => setRemoveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeSubmitting}
              onClick={confirmRemoveRequest}
            >
              {removeSubmitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
