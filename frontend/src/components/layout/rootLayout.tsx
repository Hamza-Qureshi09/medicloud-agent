import { pageMeta } from "@/lib/helpers"
import { Outlet, useLocation } from "react-router-dom"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AppSidebar } from "../common/sideBar"
import { ThemeMenu } from "../common/themeMenu"


export function RootLayout() {
    const location = useLocation()
    const meta = pageMeta[location.pathname] ?? pageMeta["/"]

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="sticky top-0 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <SidebarTrigger />
                        <div className="min-w-0">
                            <h1 className="truncate font-heading text-base font-semibold">
                                {meta.title}
                            </h1>
                            <p className="hidden truncate text-xs text-muted-foreground sm:block">
                                {meta.description}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeMenu />
                        <Avatar className="size-8">
                            <AvatarFallback>USER</AvatarFallback>
                        </Avatar>
                    </div>
                </header>
                
                {/* main content */}
                <main className="min-w-0 flex-1 p-4 md:p-6">
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
