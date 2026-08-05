import * as React from "react"
import { PanelLeft, Menu, X } from "lucide-react"
import { cn } from "../../utils/cn"

const SIDEBAR_WIDTH = "14rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

const SidebarContext = React.createContext(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

export const SidebarProvider = React.forwardRef(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const [openMobile, setOpenMobile] = React.useState(false)
    const [internalOpen, setInternalOpen] = React.useState(() => {
      const saved = localStorage.getItem("sentinel_sidebar_collapsed")
      return saved ? saved !== "true" : defaultOpen
    })

    const open = openProp ?? internalOpen
    const setOpen = React.useCallback(
      (value) => {
        const openState = typeof value === "function" ? value(open) : value
        if (setOpenProp) {
          setOpenProp(openState)
        } else {
          setInternalOpen(openState)
        }
        localStorage.setItem("sentinel_sidebar_collapsed", (!openState).toString())
      },
      [setOpenProp, open]
    )

    const toggleSidebar = React.useCallback(() => {
      return setOpen((prev) => !prev)
    }, [setOpen])

    React.useEffect(() => {
      const handleKeyDown = (event) => {
        if (
          event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          toggleSidebar()
        }
      }

      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [toggleSidebar])

    const state = open ? "expanded" : "collapsed"

    const contextValue = React.useMemo(
      () => ({
        state,
        open,
        setOpen,
        isMobile: false,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, openMobile, setOpenMobile, toggleSidebar]
    )

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          style={{
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          }}
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full text-[#F3F4F6] has-[[data-variant=inset]]:bg-[#161B22]",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    )
  }
)
SidebarProvider.displayName = "SidebarProvider"

export const Sidebar = React.forwardRef(
  (
    {
      side = "left",
      variant = "inset",
      collapsible = "icon",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { state, openMobile, setOpenMobile } = useSidebar()

    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "flex h-full w-[--sidebar-width] flex-col bg-[#1D2430] text-[#F3F4F6]",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      )
    }

    return (
      <>
        {/* Desktop Sidebar (>= md) */}
        <div
          ref={ref}
          className="group peer hidden md:block text-[#F3F4F6]"
          data-state={state}
          data-collapsible={state === "collapsed" ? collapsible : ""}
          data-variant={variant}
          data-side={side}
        >
          <div
            className={cn(
              "duration-200 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-linear",
              "group-data-[collapsible=offcanvas]:w-0",
              "group-data-[side=right]:rotate-180",
              variant === "floating" || variant === "inset"
                ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
                : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
            )}
          />
          <div
            className={cn(
              "duration-200 fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] ease-linear md:flex",
              side === "left"
                ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
                : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
              variant === "floating" || variant === "inset"
                ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
                : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=left]:border-[#2A3341] group-data-[side=right]:border-l group-data-[side=right]:border-[#2A3341]",
              className
            )}
            {...props}
          >
            <div
              data-sidebar="sidebar"
              className="flex h-full w-full flex-col bg-[#1D2430] border border-[#2A3341] rounded-xl shadow-lg group-data-[variant=inset]:bg-[#1D2430] overflow-hidden"
            >
              {children}
            </div>
          </div>
        </div>

        {/* Mobile Slide-in Drawer Overlay (< md) */}
        {openMobile && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setOpenMobile(false)}
            />

            {/* Drawer Container */}
            <div className="relative flex h-full w-[280px] max-w-[85vw] flex-col bg-[#1D2430] border-r border-[#2A3341] p-3 shadow-2xl z-50 animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-[#2A3341]">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Navigation</span>
                <button
                  onClick={() => setOpenMobile(false)}
                  className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A3341] min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div data-sidebar="sidebar" className="flex h-full w-full flex-col bg-[#1D2430] overflow-hidden pt-2">
                {children}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }
)
Sidebar.displayName = "Sidebar"

export const SidebarTrigger = React.forwardRef(
  ({ className, onClick, ...props }, ref) => {
    const { toggleSidebar, setOpenMobile } = useSidebar()

    return (
      <button
        ref={ref}
        data-sidebar="trigger"
        className={cn(
          "h-8 w-8 rounded-lg text-gray-400 hover:text-white hover:bg-[#2A3341] transition-colors flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-[32px]",
          className
        )}
        onClick={(event) => {
          onClick?.(event)
          if (window.innerWidth < 768) {
            setOpenMobile((prev) => !prev)
          } else {
            toggleSidebar()
          }
        }}
        {...props}
      >
        <Menu className="h-5 w-5 md:hidden text-gray-300" />
        <PanelLeft className="h-4 w-4 hidden md:block" />
        <span className="sr-only">Toggle Sidebar</span>
      </button>
    )
  }
)
SidebarTrigger.displayName = "SidebarTrigger"

export const SidebarInset = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-[#161B22] overflow-hidden min-w-0",
        "peer-data-[variant=inset]:min-h-[calc(100vh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:bg-[#161B22] md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:border-[#2A3341]/60 md:peer-data-[variant=inset]:shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </main>
  )
})
SidebarInset.displayName = "SidebarInset"

export const SidebarHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="header"
    className={cn(
      "flex flex-col gap-2 p-3 border-b border-[#2A3341]",
      "group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center",
      className
    )}
    {...props}
  />
))
SidebarHeader.displayName = "SidebarHeader"

export const SidebarContent = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="content"
    className={cn(
      "flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2 group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:p-1.5",
      className
    )}
    {...props}
  />
))
SidebarContent.displayName = "SidebarContent"

export const SidebarFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="footer"
    className={cn(
      "flex flex-col gap-2 p-2 border-t border-[#2A3341]",
      "group-data-[collapsible=icon]:p-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center",
      className
    )}
    {...props}
  />
))
SidebarFooter.displayName = "SidebarFooter"

export const SidebarMenu = React.forwardRef(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

export const SidebarMenuItem = React.forwardRef(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

export const SidebarMenuButton = React.forwardRef(
  (
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"

    const buttonClass = cn(
      "peer/menu-button flex w-full items-center gap-2.5 overflow-hidden rounded-md p-2 text-left text-xs font-medium outline-none transition-all",
      "hover:bg-[#2A3341]/60 hover:text-gray-200",
      "focus-visible:ring-1 focus-visible:ring-[#00C853]",
      "disabled:pointer-events-none disabled:opacity-50",
      "aria-disabled:pointer-events-none aria-disabled:opacity-50",
      "data-[active=true]:bg-[#00C853]/15 data-[active=true]:text-[#00C853] data-[active=true]:font-semibold",
      "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2 group-data-[collapsible=icon]:gap-0",
      "[&>span]:group-data-[collapsible=icon]:hidden",
      className
    )

    return (
      <div className="relative group/tooltip">
        <button
          ref={ref}
          data-sidebar="menu-button"
          data-size={size}
          data-active={isActive}
          className={buttonClass}
          {...props}
        >
          {children}
        </button>
        {isCollapsed && tooltip && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#161B22] text-white text-xs font-medium rounded-md border border-[#2A3341] shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-50">
            {tooltip}
          </div>
        )}
      </div>
    )
  }
)
SidebarMenuButton.displayName = "SidebarMenuButton"
