import React from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import useSWR from "swr"
import { api } from "@/lib/api"
import { useHealth } from "@/contexts/health-context"
import { useAsyncAction } from "@/hooks/use-async-action"
import { PageSection } from "@/components/common/pageSection"
import { PageLoading, ResourceError } from "@/components/common/resourceState"
import { ConnectionBadge } from "@/components/common/statusBadge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { ConfirmAction } from "@/components/common/confirmAction"
import { Container } from "@/components/common/container"
import {
    ArrowLeftIcon,
    CpuIcon,
    GlobeIcon,
    PlayIcon,
    StopIcon,
    TrashIcon,
    ClockIcon,
    CheckCircleIcon,
    XCircleIcon,
    RadioIcon,
    PlugsConnectedIcon,
    HardDriveIcon,
    FileCodeIcon,
    LightningIcon,
    SlidersIcon,
    QueueIcon,
    ArrowRightIcon
} from "@phosphor-icons/react"

import {
    ProfileEndpointBadge,
    ProfileInterfaceBadge,
    ProfileConfigGrid
} from "@/components/common/profileConfigView"
import { ParsedProfileConfig } from "@/lib/profile-config"

export function ProfileDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const machineId = Number(id)

    const { data: healthData, mutate: healthMutate } = useHealth()

    // Fetch Profile Detail
    const {
        data: profileData,
        error: profileError,
        mutate: profileMutate,
    } = useSWR(
        machineId ? api.profiles.detailKey(machineId) : null,
        () => api.profiles.get(machineId)
    )

    // Fetch Drivers Registry
    const driversData = React.useMemo(() => healthData?.registered_drivers ?? [], [healthData?.registered_drivers])
    const getRegisteredDriver = React.useMemo(() => {
        return new Map(
            driversData.map((driver) => [driver.id, driver])
        );
    }, [driversData])

    // Fetch associated staged orders for this specific analyzer machine
    const { data: ordersData } = useSWR(
        machineId ? api.orders.listKey({ machineId }) : null,
        () => api.orders.list({ machineId })
    )

    const profileAction = useAsyncAction("Lifecycle action failed.")

    // Explicit React.useMemo for running machine health match
    const runningMachine = React.useMemo(() => {
        return (healthData?.running_machines ?? []).find(
            (m) => m.profile.id === machineId
        )?.machine
    }, [healthData, machineId])

    // orders count & recent sample ID
    const activeOrdersCount = ordersData?.orders?.length ?? 0
    const recentSampleId = ordersData?.orders[0]?.sampleId


    // Explicit React.useMemo for matched driver
    const matchedDriver = React.useMemo(() => {
        if (!profileData?.profile || !driversData?.length) return undefined

        return getRegisteredDriver.get(profileData.profile.driverId)

    }, [driversData?.length, getRegisteredDriver, profileData?.profile])

    console.log({ profileData, driversData, ordersData, runningMachine, matchedDriver }, "details")

    // Explicit React.useMemo for dynamic connection configuration parsing
    const configParsed = React.useMemo(() => {
        const configObj = (profileData?.profile?.config && typeof profileData.profile.config === 'object')
            ? profileData.profile.config as Record<string, unknown>
            : {}

        const isSerial = 'comPort' in configObj || 'baudRate' in configObj || 'path' in configObj
        const host = configObj.host ? String(configObj.host) : "0.0.0.0"
        const port = configObj.port ? String(configObj.port) : "7001"
        const comPort = configObj.comPort ? String(configObj.comPort) : (configObj.path ? String(configObj.path) : "COM1")
        const baudRate = configObj.baudRate ? String(configObj.baudRate) : "9600"

        return { isSerial, host, port, comPort, baudRate }
    }, [profileData?.profile?.config])

    // Explicit React.useMemo for derived status logic
    // const serviceStatus = React.useMemo(() => {
    //     const isRunning = machine?.running ?? profileData?.profile?.enabled ?? false
    //     const isConnected = isRunning && (machine?.connected ?? false)
    //     const endpointDisplay = configParsed.isSerial 
    //         ? `${configParsed.comPort}:${configParsed.baudRate}` 
    //         : `${configParsed.host}:${configParsed.port}`

    //     return { isRunning, isConnected, endpointDisplay }
    // }, [machine, profileData?.profile?.enabled, configParsed])

    // if (!profileData && !profileError) return <PageLoading />
    // if (profileError || !profileData?.profile) {
    //     return (
    //         <ResourceError
    //             error={profileError || new Error("Profile not found")}
    //             onRetry={() => profileMutate()}
    //         />
    //     )
    // }

    // const profile = profileData.profile

    // async function handleLifecycleAction(action: () => Promise<unknown>) {
    //     await profileAction.execute(async () => {
    //         await action()
    //         await Promise.all([healthMutate(), profileMutate()])
    //     }).catch(() => undefined)
    // }

    return (
        <Container>
            <div className="flex flex-col gap-6 w-full">


            </div>
        </Container>
    )
}