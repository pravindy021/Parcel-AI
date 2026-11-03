import {
  BarChart3,
  Database,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react'

export const navItems = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Upload Dataset', to: '/upload', icon: Upload },
  { label: 'My Datasets', to: '/datasets', icon: Database },
  { label: 'Compare Datasets', to: '/compare', icon: BarChart3 },
  { label: 'Data Quality', to: '/data-quality', icon: ShieldCheck },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Delay Predictions', to: '/predictions', icon: TrendingUp },
  { label: 'Reports', to: '/reports', icon: FileText },
  { label: 'Team and Workspaces', to: '/team', icon: Users },
  { label: 'Settings', to: '/settings', icon: Settings },
]
