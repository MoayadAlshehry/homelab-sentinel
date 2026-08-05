import React, { useState } from 'react'
import { LogOut, User, ChevronsUpDown } from 'lucide-react'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "./ui/sidebar"

export function NavUser({ user, onLogout }) {
  const { isMobile, state } = useSidebar()
  const [menuOpen, setMenuOpen] = useState(false)

  if (!user) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="relative">
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-[#2A3341] data-[state=open]:text-white group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00C853]/20 text-[#00C853] font-bold text-xs flex-shrink-0">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-gray-200">{user.username}</span>
              <span className="truncate text-[10px] text-gray-400">Homelab Sentinel Admin</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-gray-400 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>

          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg bg-[#161B22] border border-[#2A3341] p-1 shadow-xl z-50">
              <div className="px-3 py-2 border-b border-[#2A3341] text-xs">
                <p className="font-semibold text-white">{user.username}</p>
                <p className="text-[10px] text-gray-400">Protected Sentinel Console</p>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-[#2A3341]/60 rounded-md transition-colors mt-1"
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out
              </button>
            </div>
          )}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
