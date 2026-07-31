import { PageSection } from "@/components/common/pageSection"
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState"
import { useHealth } from "@/contexts/health-context"
import { useAsyncAction } from "@/hooks/use-async-action"
import { api } from "@/lib/api"
import type { Driver, MachineProfile } from "@/types/api"
import React from "react"
import useSWR from "swr"
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
import { DotsThreeIcon, PencilSimpleIcon, PlayIcon, PlusIcon, StopIcon, TrashIcon } from "@phosphor-icons/react"
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


export function ProfilesPage() {
    const { data: healthData, mutate: healthMutate } = useHealth()

    const profileQuery = React.useMemo(() => ({ limit: 10 }), [])
    const {
        data: profilesData,
        isValidating: profileIsValidating,
        mutate: profilesMutate
    } = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
        {} // swr config for this rqst
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

    // action
    async function runProfileLifecycleAction(
        action: () => Promise<unknown>,
    ) {
        await profileAction.execute(async () => {
            await action()
            await Promise.all([driversMutate(), healthMutate(), profilesMutate()])
        }).catch(() => undefined)
    }



    return <Container>

        {/* top space details */}
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


        {profilesData?.profiles.length ? (<div className="grid gap-4 lg:grid-cols-2">
            {profilesData?.profiles.map((profile) => {
                const machine = running.get(profile.id)
                return (
                    <Card key={profile.id}>
                        {/* header */}
                        <CardHeader>
                            <CardTitle>{profile.name || `Analyzer ${profile.id}`}</CardTitle>
                            <CardDescription>{profile.driverId}</CardDescription>
                            <div className="col-start-2 row-span-2 row-end-1 flex items-center justify-end gap-2">
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
                                        <DotsThreeIcon />
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
                        </CardHeader>

                        {/* content */}
                        <CardContent className="flex flex-col gap-4">

                            {/* description list/term/details */}
                            <dl className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="text-xs text-muted-foreground">Profile ID</dt>
                                    <dd className="font-medium tabular-nums">{profile.id}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">Updated</dt>
                                    <dd className="font-medium">
                                        {new Date(
                                            profile.updatedAt || profile.createdAt,
                                        ).toLocaleDateString()}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">Updated</dt>
                                    <dd className="font-medium">
                                        {new Date(
                                            profile.updatedAt || profile.createdAt,
                                        ).toLocaleDateString()}
                                    </dd>
                                </div>
                            </dl>

                            {/* render preformatted text */}
                            <pre className="max-h-40 overflow-auto rounded-2xl bg-muted p-3 text-xs">
                                {JSON.stringify(profile.config, null, 2)}
                            </pre>

                            <div className="flex flex-wrap gap-2">
                                {/* edit profile/analyzer */}
                                <ProfileDialog
                                    drivers={driversData?.drivers ?? []}
                                    profile={profile}
                                    onCreated={profilesMutate}
                                />

                                {/* enable/disable */}
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

                                {/* actions */}
                                <ConfirmAction
                                    trigger={
                                        <Button variant="destructive" size="sm">
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
        </div>) : (
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
}


// form (create/update)
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

    // form submission
    const onSubmit: SubmitHandler<ProfileFormValues> = async (data) => {
        try {
            await saveProfile.execute(async () => {
                const input = profilePayload(data)

                // update/create cases
                if (profile?.id) await api.profiles.update(profile.id, input)
                else await api.profiles.create(input)

                // callback call
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

    return <Dialog
        open={open}
        onOpenChange={(nextOpen) => void changeOpen(nextOpen)}
    >
        {/* dialog trigger (create/update) */}
        <DialogTrigger render={dialogTrigger} />

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

                    {/* profile name */}
                    <Field
                        // orientation={"horizontal"}
                        data-invalid={Boolean(form.formState.errors.name)}
                    >
                        <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
                        <Input
                            id="profile-name"
                            aria-invalid={Boolean(form.formState.errors.name)}
                            placeholder="Main chemistry analyzer"
                            {...form.register("name")}
                        />
                        <FieldError>{form.formState.errors.name?.message}</FieldError>
                    </Field>

                    {/* registered driver */}
                    <Controller
                        control={form.control}
                        name="driverId"
                        render={({ field, fieldState }) => {
                            const selectValue = drivers.find((driver) => driver.id === field.value)?.brand
                                || drivers.find((driver) => driver.id === field.value)?.id
                                || "Choose a driver"

                            return <Field data-invalid={fieldState.invalid}>
                                <FieldLabel>Driver</FieldLabel>
                                <Select
                                    value={field.value}
                                    onValueChange={(value) => field.onChange(value ?? "")}
                                >
                                    <SelectTrigger
                                        className="w-full"
                                        aria-invalid={fieldState.invalid}
                                    >
                                        <SelectValue>
                                            {selectValue}
                                        </SelectValue>
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
                        }} />

                    {/* driver config */}
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

                    {/* profile enable/disable */}
                    <Controller
                        control={form.control}
                        name="enabled"
                        render={({ field }) => (
                            <Field orientation="horizontal">
                                <div className="flex flex-1 flex-col gap-1">
                                    <FieldLabel htmlFor="profile-enabled">
                                        Start immediately
                                    </FieldLabel>
                                    <FieldDescription>
                                        Enable the profile after it is saved.
                                    </FieldDescription>
                                </div>
                                <Switch
                                    id="profile-enabled"
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </Field>
                        )}
                    />

                    {/* all errors */}
                    {form.formState.errors.root?.message ? (
                        <Alert variant="destructive">
                            <AlertTitle>Profile not saved</AlertTitle>
                            <AlertDescription>
                                {form.formState.errors.root.message}
                            </AlertDescription>
                        </Alert>
                    ) : null}

                </FieldGroup>

                {/* footer */}
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={saveProfile.pending}
                    >
                        {saveProfile.pending ? <Spinner data-icon="inline-start" /> : null}
                        {profile ? "Save changes" : "Save profile"}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
}