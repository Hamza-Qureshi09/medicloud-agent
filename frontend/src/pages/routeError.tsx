import { HouseIcon } from "@phosphor-icons/react"
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom"


import { Button } from "@/components/ui/button"
import { ResourceEmpty } from "@/components/common/resourceState"

export function RouteErrorPage() {
    const error = useRouteError()
    const message = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : error instanceof Error
            ? error.message
            : "This page could not be opened."

    return (
        <main className="grid min-h-svh place-items-center p-6">
            <ResourceEmpty
                title="Dashboard route unavailable"
                description={message}
                action={
                    <Button render={<Link to="/dashboard/" />}>
                        <HouseIcon data-icon="inline-start" />
                        Return to overview
                    </Button>
                }
            />
        </main>
    )
}