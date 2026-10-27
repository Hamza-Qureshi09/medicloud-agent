import {
    ChartLineUpIcon,
    FlaskIcon,
    GaugeIcon,
    ListChecksIcon,
    MicroscopeIcon,
    ShareNetworkIcon,
    TestTubeIcon,
    UsersThreeIcon,
} from "@phosphor-icons/react";
import type { AgentMode } from "@/types/api";

export function navigationGroups(mode?: AgentMode) {
    return [
        {
            label: "Laboratory",
            items: [
                { to: "/dashboard", label: "Overview", icon: GaugeIcon },
                { to: "/dashboard/orders", label: "Orders", icon: ListChecksIcon },
                { to: "/dashboard/results", label: "Results", icon: TestTubeIcon },
                {
                    to: "/dashboard/statistics",
                    label: "Turnaround",
                    icon: ChartLineUpIcon,
                },
            ],
        },
        {
            label: "Analyzer setup",
            items: [
                { to: "/dashboard/profiles", label: "Analyzers", icon: MicroscopeIcon },
                { to: "/dashboard/catalogs", label: "Test catalogs", icon: FlaskIcon },
                { to: "/dashboard/drivers", label: "Drivers", icon: UsersThreeIcon },
            ],
        },
        {
            label: "Agent network",
            items: mode === "master"
                ? [{
                    to: "/dashboard/control",
                    label: "Manage slaves",
                    icon: ShareNetworkIcon,
                }]
                : mode === "slave"
                ? [{
                    to: "/dashboard/master-connection",
                    label: "Master connection",
                    icon: ShareNetworkIcon,
                }]
                : [],
        },
    ].filter((group) => group.items.length > 0);
}
