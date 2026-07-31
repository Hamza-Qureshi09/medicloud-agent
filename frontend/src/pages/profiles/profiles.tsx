import { PageSection } from "@/components/common/pageSection"
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState"
import { useHealth } from "@/contexts/health-context"
import { useAsyncAction } from "@/hooks/use-async-action"
import { api } from "@/lib/api"
import type { Driver, MachineProfile } from "@/types/api"
import React, { useState } from "react"
import useSWR from "swr"
import { Link } from "react-router-dom"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CpuIcon, DotsThreeIcon, GlobeIcon, PencilSimpleIcon, PlayIcon, PlusIcon, StopIcon, TrashIcon, ArrowRightIcon } from "@phosphor-icons/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, type SubmitHandler } from "react-hook-form"
import { profileFormSchema, profilePayload, type ProfileFormValues } from "@/lib/schema"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { ConnectionBadge } from "@/components/common/statusBadge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmAction } from "@/components/common/confirmAction"
import { Container } from "@/components/common/container"


// Directly import Shadcn's atomic UI elements
import {
    Pagination as ShadcnPagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"

const ITEMS_PER_PAGE = 6

export function ProfilesPage() {
    const [currentPage, setCurrentPage] = useState(1)
    const { data: healthData, mutate: healthMutate } = useHealth()

    const profileQuery = React.useMemo(() => ({
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
    }), [currentPage])

    const {
        data: profilesData,
        isValidating: profileIsValidating,
        mutate: profilesMutate
    } = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
        {}
    )

    const {
        data: driversData,
        error: profilesError,
        mutate: driversMutate
    } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list(),
    )

    const running = React.useMemo(() => {
        return new Map(
            (healthData?.running_machines ?? []).map((item) => [
                item.profile.id,
                item.machine,
            ]),
        )
    }, [healthData])

    const profileAction = useAsyncAction("Analyzer action failed.")

    if (!profilesData && !profilesError) return <PageLoading />
    if (profilesError) {
        return (
            <ResourceError
                error={profilesError}
                onRetry={() => profilesMutate()}
            />
        )
    }

    async function runProfileLifecycleAction(
        action: () => Promise<unknown>,
    ) {
        await profileAction.execute(async () => {
            await action()
            await Promise.all([driversMutate(), healthMutate(), profilesMutate()])
        }).catch(() => undefined)
    }

    const totalProfiles = profilesData?.profiles.length ?? 0
    const totalPages = Math.ceil(totalProfiles / ITEMS_PER_PAGE) || 1

    return (
        <Container>

            {/* Header Section */}
            <PageSection
                eyebrow="Configuration"
                title="Analyzer profiles"
                description="Each profile connects one stored machine configuration to a registered SDK driver."
                actions={
                    <>
                        <RefreshButton
                            isLoading={profileIsValidating}
                            onRefresh={() => profilesMutate()}
                        />
                        <ProfileDialog
                            drivers={driversData?.drivers ?? []}
                            onCreated={profilesMutate}
                        />
                    </>
                }
            />

            {profileAction.error ? (
                <Alert variant="destructive">
                    <AlertTitle>Analyzer action failed</AlertTitle>
                    <AlertDescription>{profileAction.error}</AlertDescription>
                </Alert>
            ) : null}

            {/* Profiles Cards Grid */}
            {profilesData?.profiles.length ? (
                <div className="flex flex-col gap-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                        {profilesData?.profiles.map((profile) => {
                            const machine = running.get(profile.id)
                            const matchedDriver = driversData?.drivers.find((d) => d.id === profile.driverId)

                            const host = profile.config && typeof profile.config === 'object' && 'host' in profile.config ? String(profile.config.host) : "0.0.0.0"
                            const port = profile.config && typeof profile.config === 'object' && 'port' in profile.config ? String(profile.config.port) : "7001"

                            return (
                                <Card key={profile.id} className="group transition-all duration-200 hover:border-foreground/20">
                                    {/* Header */}
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <CardTitle>
                                                    <Link
                                                        to={`/dashboard/profiles/${profile.id}`}
                                                        className="hover:underline hover:text-primary transition-colors inline-flex items-center gap-1.5 font-bold text-base"
                                                    >
                                                        {profile.name || `Analyzer ${profile.id}`}
                                                        <ArrowRightIcon className="h-4 w-4 opacity-50 transition-opacity group-hover:opacity-100" />
                                                    </Link>
                                                </CardTitle>

                                                <CardDescription className="pt-1">
                                                    <Link
                                                        to={`/dashboard/profiles/${profile.id}`}
                                                        className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
                                                    >
                                                        <CpuIcon className="h-3.5 w-3.5" />
                                                        {profile.driverId}
                                                    </Link>
                                                </CardDescription>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <ConnectionBadge
                                                    connected={machine?.connected ?? false}
                                                    running={machine?.running ?? profile.enabled}
                                                />
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        render={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={`Actions for ${profile.name || profile.id}`}
                                                            />
                                                        }
                                                    >
                                                        <DotsThreeIcon weight="bold" />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuGroup>
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    void runProfileLifecycleAction(
                                                                        () => api.profiles.start(profile.id),
                                                                    )
                                                                }
                                                            >
                                                                <PlayIcon />
                                                                Start
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    void runProfileLifecycleAction(
                                                                        () => api.profiles.stop(profile.id),
                                                                    )
                                                                }
                                                            >
                                                                <StopIcon />
                                                                Stop
                                                            </DropdownMenuItem>
                                                        </DropdownMenuGroup>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    {/* Content */}
                                    <CardContent className="flex flex-col gap-4">
                                        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                            <div>
                                                <dt className="text-xs text-muted-foreground">Profile ID</dt>
                                                <dd className="font-semibold tabular-nums">#{profile.id}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-muted-foreground">Driver Brand</dt>
                                                <dd className="font-medium">{matchedDriver?.brand || "SNIBE"}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-muted-foreground">Endpoint</dt>
                                                <dd className="font-mono text-xs font-medium flex items-center gap-1">
                                                    <GlobeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {host}:{port}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-muted-foreground">Updated</dt>
                                                <dd className="font-medium text-xs">
                                                    {new Date(
                                                        profile.updatedAt || profile.createdAt,
                                                    ).toLocaleDateString()}
                                                </dd>
                                            </div>
                                        </dl>

                                        <div className="space-y-1">
                                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                                Connection Settings
                                            </span>
                                            <pre className="max-h-36 overflow-auto rounded-2xl bg-muted p-3 text-xs font-mono">
                                                {JSON.stringify(profile.config, null, 2)}
                                            </pre>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30 mt-1">
                                            <ProfileDialog
                                                drivers={driversData?.drivers ?? []}
                                                profile={profile}
                                                onCreated={profilesMutate}
                                            />

                                            {profile.enabled ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        void runProfileLifecycleAction(
                                                            () => api.profiles.stop(profile.id),
                                                        )
                                                    }
                                                >
                                                    <StopIcon data-icon="inline-start" />
                                                    Stop analyzer
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        void runProfileLifecycleAction(
                                                            () => api.profiles.start(profile.id),
                                                        )
                                                    }
                                                >
                                                    <PlayIcon data-icon="inline-start" />
                                                    Start analyzer
                                                </Button>
                                            )}

                                            <ConfirmAction
                                                trigger={
                                                    <Button variant="destructive" size="sm" className="ml-auto">
                                                        <TrashIcon data-icon="inline-start" />
                                                        Delete
                                                    </Button>
                                                }
                                                title="Delete analyzer profile?"
                                                description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                                actionLabel="Delete profile"
                                                onConfirm={() =>
                                                    runProfileLifecycleAction(
                                                        () => api.profiles.remove(profile.id),
                                                    )
                                                }
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>

                    {/* Pure Shadcn Pagination */}
                    {totalPages > 1 && (
                        <div className="pt-2 flex justify-center">
                            <ShadcnPagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                        />
                                    </PaginationItem>

                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                isActive={currentPage === page}
                                                onClick={() => setCurrentPage(page)}
                                                className="cursor-pointer"
                                            >
                                                {page}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ))}

                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </ShadcnPagination>
                        </div>
                    )}
                </div>
            ) : (
                <ResourceEmpty
                    title="No analyzer profiles"
                    description="Add a profile to connect one of the registered machine drivers."
                    action={
                        <ProfileDialog
                            drivers={driversData?.drivers ?? []}
                            onCreated={profilesMutate}
                        />
                    }
                />
            )}
        </Container>
    )
}

function ProfileDialog({
    drivers,
    profile,
    onCreated,
}: {
    drivers: Driver[]
    profile?: MachineProfile
    onCreated: () => Promise<unknown>
}) {
    const [open, setOpen] = React.useState(false)

    const saveProfile = useAsyncAction("Profile could not be saved.")

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: profile?.name ?? "",
            driverId: profile?.driverId ?? drivers[0]?.id ?? "",
            enabled: profile?.enabled ?? false,
            config: profile
                ? JSON.stringify(profile.config, null, 2)
                : '{\n  "host": "0.0.0.0",\n  "port": 7001\n}',
        },
    });

    // dialog handler
    async function changeOpen(nextOpen: boolean) {
        setOpen(nextOpen)

        // clearn prvious errors/state
        if (nextOpen) {
            saveProfile.reset()
            form.clearErrors()
        }

        // default selection of driver id
        if (nextOpen && !profile?.id && !form.getValues("driverId") && drivers[0]) {
            form.setValue("driverId", drivers[0].id)
        }

        // // if i want to populate the whole profile form with updated data not stale data
        // if (nextOpen && profile) {
        //     const result = await saveProfile.execute(
        //         () => api.profiles.get(profile.id)
        //     )

        //     form.reset({
        //         name: result.profile.name,
        //         driverId: result.profile.driverId,
        //         enabled: result.profile.enabled,
        //         config: JSON.stringify(
        //             result.profile.config,
        //             null,
        //             2
        //         ),
        //     })
        // }
    }

    const onSubmit: SubmitHandler<ProfileFormValues> = async (data) => {
        try {
            await saveProfile.execute(async () => {
                const input = profilePayload(data)

                if (profile?.id) await api.profiles.update(profile.id, input)
                else await api.profiles.create(input)

                await onCreated()
                setOpen(false)
            })
        } catch (error) {
            form.setError("root", {
                message:
                    error instanceof Error ? error.message : "Profile could not be saved.",
            })
        }
    }

    const dialogTrigger = profile ? (
        <Button variant="outline" size="sm">
            <PencilSimpleIcon data-icon="inline-start" />
            Edit profile
        </Button>
    ) : (
        <Button size={"sm"}>
            <PlusIcon data-icon="inline-start" />
            Add analyzer
        </Button>
    )

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => void changeOpen(nextOpen)}
        >
            <DialogTrigger
                render={dialogTrigger}
            />

            <DialogContent>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {profile?.id ? "Edit analyzer profile" : "Add analyzer profile"}
                        </DialogTitle>
                        <DialogDescription>
                            Choose a registered driver and provide its connection settings.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup className="py-5">
                        <Field data-invalid={Boolean(form.formState.errors.name)}>
                            <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
                            <Input
                                id="profile-name"
                                aria-invalid={Boolean(form.formState.errors.name)}
                                placeholder="Main chemistry analyzer"
                                {...form.register("name")}
                            />
                            <FieldError>{form.formState.errors.name?.message}</FieldError>
                        </Field>

                        <Controller
                            control={form.control}
                            name="driverId"
                            render={({ field, fieldState }) => {
                                const selectValue = drivers.find((driver) => driver.id === field.value)?.brand
                                    || drivers.find((driver) => driver.id === field.value)?.id
                                    || "Choose a driver"

                                return (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>Driver</FieldLabel>
                                        <Select
                                            value={field.value}
                                            onValueChange={(value) => field.onChange(value ?? "")}
                                        >
                                            <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                                                <SelectValue>{selectValue}</SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    {drivers.map((driver) => (
                                                        <SelectItem key={driver.id} value={driver.id}>
                                                            {driver.brand || driver.id}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )
                            }}
                        />

                        <Field data-invalid={Boolean(form.formState.errors.config)}>
                            <FieldLabel htmlFor="profile-config">Configuration JSON</FieldLabel>
                            <Textarea
                                id="profile-config"
                                aria-invalid={Boolean(form.formState.errors.config)}
                                rows={7}
                                className="font-mono text-xs"
                                {...form.register("config")}
                            />
                            <FieldDescription>
                                The selected driver validates these values before starting.
                            </FieldDescription>
                            <FieldError>{form.formState.errors.config?.message}</FieldError>
                        </Field>

                        <Controller
                            control={form.control}
                            name="enabled"
                            render={({ field }) => (
                                <Field orientation="horizontal">
                                    <div className="flex flex-1 flex-col gap-1">
                                        <FieldLabel htmlFor="profile-enabled">Start immediately</FieldLabel>
                                        <FieldDescription>Enable the profile after it is saved.</FieldDescription>
                                    </div>
                                    <Switch
                                        id="profile-enabled"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </Field>
                            )}
                        />

                        {form.formState.errors.root?.message ? (
                            <Alert variant="destructive">
                                <AlertTitle>Profile not saved</AlertTitle>
                                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                            </Alert>
                        ) : null}
                    </FieldGroup>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saveProfile.pending}>
                            {saveProfile.pending ? <Spinner data-icon="inline-start" /> : null}
                            {profile ? "Save changes" : "Save profile"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}