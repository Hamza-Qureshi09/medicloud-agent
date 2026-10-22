import { NavLink, useLocation } from "react-router-dom";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarSeparator,
} from "@/components/ui/sidebar"
import { ActivityIcon } from "@phosphor-icons/react"
import { navigationGroups } from "@/lib/navigation"
import { useMachineContext } from "../../contexts/machine-context.tsx";


export function AppSidebar() {
    const location = useLocation()
    const { connected, activeSlaves, mode } = useMachineContext()

    return (
        <Sidebar variant="floating" collapsible="icon" className="bg-background">

            {/* sidebar header */}
            <SidebarHeader className="bg-background">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" tooltip="mediCloud machines">
                            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                <ActivityIcon weight="bold" />
                            </span>
                            <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                                <span className="font-heading font-semibold">MediCloud</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    Machine control
                                </span>
                            </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            {/* sideBar content */}
            <SidebarContent className="bg-background">
                {navigationGroups(mode).map((group) => <SidebarGroup key={group.label}>
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {group.items.map((item) => (
                                    <SidebarMenuItem key={item.to}>
                                        <SidebarMenuButton
                                            render={<NavLink to={item.to} />}
                                            isActive={
                                            location.pathname.replace(/\/$/, "") === item.to || (item.to !== "/dashboard" && location.pathname.startsWith(item.to + "/"))
                                            }
                                            tooltip={item.label}
                                            size={"sm"}
                                            variant={"default"}
                                            disabled={false}
                                            className=""
                                        >
                                            <item.icon />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>)}
            </SidebarContent>

            {/* sidebar footer */}
            <SidebarFooter className="bg-background">
                <SidebarMenu>
                    {mode === "master" && (
                        <>
                            <SidebarMenuItem>
                                <SidebarMenuButton tooltip="Slaves online" render={<NavLink to="/dashboard/control" />}>
                                    <span className="relative flex size-7 items-center justify-center">
                                        <span className="size-2 rounded-full bg-primary" />
                                        {activeSlaves > 0 && <span className="absolute size-4 animate-ping rounded-full bg-primary/20" />}
                                    </span>
                                    <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                                        <span className="text-xs font-medium">Slaves online</span>
                                        <span className="text-xs text-muted-foreground">
                                            {activeSlaves} connected
                                        </span>
                                    </span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarSeparator className="my-1 mx-2" />
                        </>
                    )}
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Service health">
                            <span className="relative flex size-7 items-center justify-center">
                                <span className="size-2 rounded-full bg-primary" />
                                {connected > 0 && <span className="absolute size-4 animate-ping rounded-full bg-primary/20" />}
                            </span>
                            <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                                <span className="text-xs font-medium">Service online</span>
                                <span className="text-xs text-muted-foreground">
                                    {connected ?? 0} connected
                                </span>
                            </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>

            {/* invisible clickable area used to collapse/expand the sidebar */}
            <SidebarRail />
        </Sidebar >
    )

}