import React from 'react'
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "./ui/sidebar"

export function NavMain({ items, activeTab, setActiveTab }) {
  const { setOpenMobile } = useSidebar()

  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon
        const isActive = activeTab === item.id
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              isActive={isActive}
              tooltip={item.title}
              onClick={() => {
                setActiveTab(item.id)
                if (setOpenMobile) setOpenMobile(false)
              }}
            >
              {Icon && <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-[#00C853]' : 'text-gray-400'}`} />}
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
