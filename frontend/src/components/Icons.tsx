import type { SVGProps } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, UserPlus, Target, Users, FolderKanban, Receipt, Clock, BarChart3, Bell,
  LayoutTemplate, Settings, Search, Sun, Moon, Plus, X, Check, Eye, EyeOff, LogOut,
  Menu, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Inbox, Sparkles,
  Paperclip, Trash2, Calendar, ArrowRight, Upload, Activity, Download, KeyRound,
} from "lucide-react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// Lucide is a maintained, tree-shakeable icon set in the same geometric
// stroke style this app already committed to - swapping the underlying
// renderer here (instead of touching all ~35 call sites) keeps every
// `<IconX size={..} />` usage in the app working unchanged. Every icon
// defaults to aria-hidden (decorative; the handful that are a button's
// entire content get their accessible name from the button's own
// aria-label, not the icon) - callers can still override it explicitly.
function wrap(Lucide: LucideIcon, defaultSize: number) {
  return function WrappedIcon({ size = defaultSize, ...p }: IconProps) {
    return <Lucide size={size} strokeWidth={1.7} aria-hidden="true" {...p} />;
  };
}

export const IconDashboard = wrap(LayoutDashboard, 17);
export const IconLeads = wrap(UserPlus, 17);
export const IconClients = wrap(Users, 17);
export const IconProjects = wrap(FolderKanban, 17);
export const IconInvoices = wrap(Receipt, 17);
export const IconFollowups = wrap(Clock, 17);
export const IconReports = wrap(BarChart3, 17);
export const IconBell = wrap(Bell, 17);
export const IconUsers = wrap(Users, 17);
export const IconTemplate = wrap(LayoutTemplate, 17);
export const IconSettings = wrap(Settings, 17);
export const IconSearch = wrap(Search, 17);
export const IconSun = wrap(Sun, 17);
export const IconMoon = wrap(Moon, 17);
export const IconPlus = wrap(Plus, 17);
export const IconX = wrap(X, 17);
export const IconCheck = wrap(Check, 17);
export const IconEye = wrap(Eye, 17);
export const IconEyeOff = wrap(EyeOff, 17);
export const IconLogout = wrap(LogOut, 17);
export const IconMenu = wrap(Menu, 17);
export const IconChevronDown = wrap(ChevronDown, 17);
export const IconChevronLeft = wrap(ChevronLeft, 17);
export const IconChevronRight = wrap(ChevronRight, 17);
export const IconAlert = wrap(AlertTriangle, 17);
export const IconInbox = wrap(Inbox, 24);
export const IconSparkle = wrap(Sparkles, 17);
export const IconPaperclip = wrap(Paperclip, 17);
export const IconTrash = wrap(Trash2, 17);
export const IconCalendar = wrap(Calendar, 17);
export const IconArrowRight = wrap(ArrowRight, 17);
export const IconOpportunities = wrap(Target, 17);
export const IconUpload = wrap(Upload, 17);
export const IconActivity = wrap(Activity, 17);
export const IconDownload = wrap(Download, 17);
export const IconKey = wrap(KeyRound, 17);
