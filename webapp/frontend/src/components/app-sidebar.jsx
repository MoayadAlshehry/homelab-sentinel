import React from 'react'
import {
  LayoutDashboard,
  Server,
  Wifi,
  Activity,
  Settings,
  Sun,
  Moon,
} from "lucide-react"

import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "./ui/sidebar"

const data = {
  navMain: [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "containers",
      title: "Containers",
      icon: Server,
    },
    {
      id: "network",
      title: "Network",
      icon: Wifi,
    },
    {
      id: "monitoring",
      title: "Monitoring",
      icon: Activity,
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
    },
  ],
}

export function AppSidebar({ activeTab, setActiveTab, user, onLogout, theme, toggleTheme, ...props }) {
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-center p-1 overflow-hidden transition-all">
          <img
            src="/logo.svg"
            alt="Homelab Sentinel"
            className="h-10 w-auto max-w-full object-contain group-data-[collapsible=icon]:h-9 transition-all"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} activeTab={activeTab} setActiveTab={setActiveTab} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleTheme}
              tooltip={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="w-full flex items-center gap-2.5 text-xs font-medium text-gray-300 hover:bg-[#2A3341] hover:text-white rounded-lg transition-colors group-data-[collapsible=icon]:justify-center min-h-[36px]"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400 flex-shrink-0" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
              )}
              <span className="truncate group-data-[collapsible=icon]:hidden">
                {theme === 'dark' ? "Light Mode" : "Dark Mode"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
