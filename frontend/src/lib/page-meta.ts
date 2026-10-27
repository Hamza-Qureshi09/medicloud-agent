// dashboard header metadata
export const pageMeta: Record<string, { title: string; description: string }> =
    {
        "/": {
            title: "Laboratory operations",
            description:
                "Live analyzer activity, order flow, and turnaround performance.",
        },
        "/profiles": {
            title: "Analyzer profiles",
            description:
                "Configure, start, stop, and monitor connected instruments.",
        },
        "/orders": {
            title: "Test orders",
            description:
                "Stage worklists, track progress, and resolve failed submissions.",
        },
        "/results": {
            title: "Result audit",
            description:
                "Review immutable analyzer results and reported analytes.",
        },
        "/statistics": {
            title: "Turnaround intelligence",
            description:
                "Inspect learned test durations used for completion estimates.",
        },
        "/catalogs": {
            title: "Test catalogs",
            description:
                "Browse assays supported by each registered analyzer driver.",
        },
        "/master-connection": {
            title: "Master connection",
            description: "Connect this slave to its master agent and monitor synchronization.",
        },
        "/control": {
            title: "Control Center",
            description:
                "Monitor and manage connected slave agents and their capabilities.",
        },
        "/drivers": {
            title: "Machine drivers",
            description:
                "Review the analyzer integrations available to this service.",
        },
    };

/** The router includes /dashboard and nested record IDs in its pathname. */
export function getPageMeta(pathname: string) {
    const path = pathname.replace(/^\/dashboard(?=\/|$)/, "")
    const section = path.split("/").filter(Boolean)[0]
    return pageMeta[section ? `/${section}` : "/"] ?? pageMeta["/"]
}
