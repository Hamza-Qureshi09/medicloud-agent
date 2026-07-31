
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
} from "@/components/ui/sidebar"
import {
    ActivityIcon,
    ChartLineUpIcon,
    FlaskIcon,
    GaugeIcon,
    ListChecksIcon,
    MicroscopeIcon,
    TestTubeIcon,
    UsersThreeIcon,
} from "@phosphor-icons/react"
import { useHealth } from "@/contexts/health-context";

const navigation = [
    { to: "/dashboard", label: "Overview", icon: GaugeIcon },
    { to: "/dashboard/profiles", label: "Analyzers", icon: MicroscopeIcon },
    { to: "/dashboard/orders", label: "Orders", icon: ListChecksIcon },
    { to: "/dashboard/results", label: "Results", icon: TestTubeIcon },
    { to: "/dashboard/statistics", label: "Turnaround", icon: ChartLineUpIcon },
    { to: "/dashboard/catalogs", label: "Test catalogs", icon: FlaskIcon },
    { to: "/dashboard/drivers", label: "Drivers", icon: UsersThreeIcon },
]

export function AppSidebar() {
    const location = useLocation()
    const { connected } = useHealth()


    return (
        <Sidebar variant="floating" collapsible="icon" className="bg-background">

            {/* sidebar header */}
            <SidebarHeader className="bg-background/50">
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
            <SidebarContent className="bg-background/50">
                <SidebarGroup>
                    <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navigation.map((item) => (
                                <SidebarMenuItem key={item.to}>
                                    <SidebarMenuButton
                                        render={<NavLink to={item.to} />}
                                        isActive={
                                            location.pathname === item.to // this will not help in nested paths matching
                                            /**
                                             * Allow this kind of nested isActive path.
                                             * /drivers
                                             * /drivers /123 /edit
                                             */
                                            // item.to === "/"
                                            //     ? location.pathname === "/"
                                            //     : location.pathname.startsWith(item.to)
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
                </SidebarGroup>
            </SidebarContent>

            {/* sidebar footer */}
            <SidebarFooter className="bg-background/50">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Service health">
                            <span className="relative flex size-7 items-center justify-center">
                                <span className="size-2 rounded-full bg-primary" />
                                <span className="absolute size-4 animate-ping rounded-full bg-primary/20" />
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