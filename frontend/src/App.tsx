import React from "react";
import { SWRConfig } from "swr"
import { swrConfig } from "./lib/swr";
import { ThemeProvider } from "./contexts/theme-context";
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouterProvider } from "react-router-dom"
import { router } from "./router";
import { MachineProvider } from "./contexts/machine-context";
import { Toaster } from "sonner"

export default function App() {
    return (
        <ThemeProvider>
            {(theme) => <React.Fragment>
                <SWRConfig value={swrConfig}>
                    <TooltipProvider>
                        <MachineProvider>
                            <RouterProvider
                                useTransitions={true}
                                router={router}
                            />
                        </MachineProvider>
                    </TooltipProvider>
                </SWRConfig>

                {/* toaster */}
                <Toaster theme={theme} richColors closeButton className="" />
            </React.Fragment>}
        </ThemeProvider>
    );
}