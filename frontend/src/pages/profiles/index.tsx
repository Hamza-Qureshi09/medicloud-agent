import { PageSection } from "@/components/common/pageSection";
import {
    PageLoading,
    RefreshButton,
    ResourceEmpty,
    ResourceError,
} from "@/components/common/resourceState";
import { useHealth } from "@/contexts/health-context";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useProfileForm } from "@/hooks/use-profile-form";
import { api } from "@/lib/api";
import type { Driver, MachineProfile } from "@/types/api";
import React, { useState } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    ArrowRightIcon,
    CpuIcon,
    DotsThreeIcon,
    GlobeIcon,
    PencilSimpleIcon,
    PlayIcon,
    PlusIcon,
    StopIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
// import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { ConnectionBadge } from "@/components/common/statusBadge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/common/confirmAction";
import { Container } from "@/components/common/container";
import { ITEMS_PER_PAGE } from "@/lib/global";
import { Pagination } from "@/components/common/pagination";


export function ProfilesPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const { data: healthData, mutate: healthMutate } = useHealth();

    const {
        data: profileCount,
        error: countError,
        mutate: profileCountMutate
    } = useSWR(
        api.profiles.countKey,
        () => api.profiles.count(),
        {}
    )

    const count = profileCount?.count ?? 0;
    const totalPages = Math.max(
        1,
        Math.ceil(count / ITEMS_PER_PAGE)
    );

    const profileQuery = React.useMemo(() => ({
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
    }), [currentPage]);

    const {
        data: profilesData,
        isValidating: profileIsValidating,
        mutate: profilesMutate,
    } = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
        {},
    );

    const {
        data: driversData,
        error: profilesError,
        mutate: driversMutate,
    } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list(),
    );

    const running = React.useMemo(() => {
        return new Map(
            (healthData?.running_machines ?? []).map((item) => [
                item.profile.id,
                item.machine,
            ]),
        );
    }, [healthData]);

    const driversById = React.useMemo(
        () =>
            new Map(
                (driversData?.drivers ?? []).map(driver => [
                    driver.id,
                    driver,
                ])
            ),
        [driversData]
    );

    const profileAction = useAsyncAction("Analyzer action failed.");
    async function runHardRefresh() {
        await Promise.all([
            healthMutate(),
            driversMutate(),
            profileCountMutate(),
            profilesMutate(),
        ]);
    }
    async function runProfileLifecycleAction(
        action: () => Promise<unknown>,
    ) {
        await profileAction.execute(async () => {
            await action();
            await runHardRefresh();
        }).catch(() => undefined);
    }


    if (!profilesData && !profilesError) return <PageLoading />;
    if (profilesError || countError) {
        return (
            <ResourceError
                error={profilesError ?? countError}
                onRetry={runHardRefresh}
            />
        );
    }


    return (
        <Container>
            <PageSection
                eyebrow="Configuration"
                title="Analyzer profiles"
                description="Each profile connects one stored machine configuration to a registered SDK driver."
                actions={
                    <>
                        <RefreshButton
                            isLoading={profileIsValidating}
                            onRefresh={runHardRefresh}
                        />
                        <ProfileDialog
                            drivers={driversData?.drivers ?? []}
                            onCreated={runHardRefresh}
                        />
                    </>
                }
            />

            {profileAction.error ? (
                <Alert variant="destructive">
                    <AlertTitle className="font-normal">Analyzer action failed</AlertTitle>
                    <AlertDescription className="font-normal">
                        {profileAction.error}
                    </AlertDescription>
                </Alert>
            ) : null}

            {profilesData?.profiles.length ? (
                <div className="flex flex-col gap-6">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                        {profilesData?.profiles.map((profile) => {
                            const machine = running.get(profile.id);
                            const matchedDriver = driversById.get(profile.driverId);

                            const host =
                                profile.config &&
                                    typeof profile.config === "object" &&
                                    "host" in profile.config
                                    ? String(profile.config.host)
                                    : "0.0.0.0";
                            const port =
                                profile.config &&
                                    typeof profile.config === "object" &&
                                    "port" in profile.config
                                    ? String(profile.config.port)
                                    : "7001";

                            return (
                                <Card
                                    key={profile.id}
                                    className="group transition-all duration-200 hover:border-foreground/20 flex flex-col justify-between border-border bg-card"
                                >
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <CardTitle>
                                                    <Link
                                                        to={`/dashboard/profiles/${profile.id}`}
                                                        className="hover:underline hover:text-primary transition-colors inline-flex items-center gap-1.5 font-normal text-base text-foreground"
                                                    >
                                                        {profile.name ||
                                                            `Analyzer ${profile.id}`}
                                                        <ArrowRightIcon className="h-4 w-4 opacity-50 transition-opacity group-hover:opacity-100" />
                                                    </Link>
                                                </CardTitle>

                                                <CardDescription className="pt-1">
                                                    <Link
                                                        to={`/dashboard/profiles/${profile.id}`}
                                                        className="inline-flex items-center gap-1 font-normal text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
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
                                                                className="font-normal"
                                                                onClick={() =>
                                                                    void runProfileLifecycleAction(
                                                                        () => api.profiles.start(profile.id)
                                                                    )
                                                                }
                                                            >
                                                                <PlayIcon />
                                                                Start
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="font-normal"
                                                                onClick={() =>
                                                                    void runProfileLifecycleAction(
                                                                        () => api.profiles.stop(profile.id)
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

                                    <CardContent className="flex flex-col gap-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-2xl bg-muted/50 p-3 flex flex-col justify-between">
                                                <div className="mb-2">
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Profile ID
                                                    </span>
                                                    <span className="font-normal tabular-nums text-sm text-foreground">
                                                        #{profile.id}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Driver Brand
                                                    </span>
                                                    <span className="font-normal text-sm truncate block text-foreground">
                                                        {matchedDriver?.brand || "SNIBE"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="rounded-2xl bg-muted/50 p-3 flex flex-col justify-between">
                                                <div className="mb-2">
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Endpoint
                                                    </span>
                                                    <span className="font-normal text-xs flex items-center gap-1 mt-0.5 truncate text-foreground">
                                                        <GlobeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        {host}:{port}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Updated
                                                    </span>
                                                    <span className="font-normal text-xs block text-foreground">
                                                        {new Date(profile.updatedAt || profile.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <span className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider block">
                                                Connection Settings
                                            </span>
                                            <pre className="max-h-36 overflow-auto rounded-2xl bg-muted p-3 text-xs font-normal text-foreground">
                                                {JSON.stringify(profile.config, null, 2)}
                                            </pre>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/30 mt-1">
                                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-1">
                                                <ProfileDialog
                                                    drivers={driversData?.drivers ?? []}
                                                    profile={profile}
                                                    onCreated={runHardRefresh}
                                                />

                                                {profile.enabled ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="shrink-0 font-normal"
                                                        onClick={() =>
                                                            void runProfileLifecycleAction(
                                                                () => api.profiles.stop(profile.id)
                                                            )
                                                        }
                                                    >
                                                        <StopIcon data-icon="inline-start" />
                                                        Stop analyzer
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        className="shrink-0 font-normal"
                                                        onClick={() =>
                                                            void runProfileLifecycleAction(
                                                                () => api.profiles.start(profile.id)
                                                            )
                                                        }
                                                    >
                                                        <PlayIcon data-icon="inline-start" />
                                                        Start analyzer
                                                    </Button>
                                                )}
                                            </div>

                                            <ConfirmAction
                                                trigger={
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="w-full sm:w-auto shrink-0 font-normal"
                                                    >
                                                        <TrashIcon data-icon="inline-start" />
                                                        Delete
                                                    </Button>
                                                }
                                                title="Delete analyzer profile?"
                                                description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                                actionLabel="Delete profile"
                                                onConfirm={() =>
                                                    runProfileLifecycleAction(
                                                        () => api.profiles.remove(profile.id)
                                                    )
                                                }
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="pt-2 flex justify-center">

                            <Pagination
                                page={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
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
                            onCreated={runHardRefresh}
                        />
                    }
                />
            )}
        </Container>
    );
}


function ProfileDialog({
    drivers,
    profile,
    onCreated,
}: {
    drivers: Driver[];
    profile?: MachineProfile;
    onCreated: () => Promise<unknown>;
}) {

    const {
        form,
        dispatch,
        selectedDriver,
        open,
        saveProfile,
        handleDriverChange,
        handleOpenChange,
        handleSubmit,
    } = useProfileForm(drivers, onCreated, profile);


    const dialogTrigger = profile
        ? (
            <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-initial font-normal"
            >
                <PencilSimpleIcon data-icon="inline-start" />
                Edit profile
            </Button>
        )
        : (
            <Button size={"sm"} className="font-normal">
                <PlusIcon data-icon="inline-start" />
                Add analyzer
            </Button>
        );

    return (
        <Dialog
            open={open}
            onOpenChange={handleOpenChange}
        >
            <DialogTrigger
                render={dialogTrigger}
            />
           
            <DialogContent
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <form onSubmit={handleSubmit} noValidate>
                    <DialogHeader>
                        <DialogTitle className="font-normal">
                            {profile?.id
                                ? "Edit analyzer profile"
                                : "Add analyzer profile"}
                        </DialogTitle>
                        <DialogDescription className="font-normal">
                            Choose a registered driver. The form adapts to show exactly what that driver needs.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup className="py-5">

                        {/* Display Name (Optional) */}
                        <Field>
                            <FieldLabel htmlFor="profile-name" className="font-normal">
                                Display name{" "}
                                <span className="text-xs text-muted-foreground ml-1">(optional)</span>
                            </FieldLabel>
                            <Input
                                id="profile-name"
                                placeholder="Main chemistry analyzer"
                                className="font-normal"
                                value={form.name}
                                onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
                            />
                        </Field>

                        {/* Driver selector */}
                        <Field data-invalid={Boolean(form.errors.driverId)}>
                            <FieldLabel className="font-normal">
                                Driver <span className="text-destructive ml-0.5">*</span>
                            </FieldLabel>
                            <Select
                                value={form.driverId}
                                onValueChange={(v) => v && handleDriverChange(v)}>
                                <SelectTrigger className="w-full font-normal" aria-invalid={Boolean(form.errors.driverId)}>
                                    <SelectValue className="font-normal">
                                        {selectedDriver?.brand || selectedDriver?.id || "Choose a driver"}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {drivers.map((d) => (
                                            <SelectItem key={d.id} value={d.id} className="font-normal">
                                                {d.brand || d.id}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError className="font-normal">{form.errors.driverId}</FieldError>
                        </Field>


                        {/* Dynamic config fields */}
                        {(selectedDriver?.configFields ?? []).map((field) => {
                            const val = form.values[field.key] ?? "";
                            const err = form.errors[field.key];
                            const fieldId = `profile-config-${field.key}`;

                            if (field.type === "select" && field.options) {
                                return (
                                    <Field key={field.key} data-invalid={Boolean(err)}>
                                        <FieldLabel htmlFor={fieldId} className="font-normal">
                                            {field.label}
                                            {field.required && <span className="text-destructive ml-0.5">*</span>}
                                        </FieldLabel>
                                        <Select
                                            value={val}
                                            onValueChange={(v) => v !== null && dispatch({ type: "SET_FIELD", key: field.key, value: v })}
                                        >
                                            <SelectTrigger id={fieldId} className="w-full font-normal" aria-invalid={Boolean(err)}>
                                                <SelectValue className="font-normal" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    {field.options.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value} className="font-normal">
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                        {field.hint && <FieldDescription className="font-normal">{field.hint}</FieldDescription>}
                                        <FieldError className="font-normal">{err}</FieldError>
                                    </Field>
                                );
                            }

                            if (field.type === "boolean") {
                                return (
                                    <Field key={field.key} orientation="horizontal">
                                        <div className="flex flex-1 flex-col gap-1">
                                            <FieldLabel htmlFor={fieldId} className="font-normal">{field.label}</FieldLabel>
                                            {field.hint && <FieldDescription className="font-normal">{field.hint}</FieldDescription>}
                                        </div>
                                        <Switch
                                            id={fieldId}
                                            checked={val === "true"}
                                            onCheckedChange={(checked) => dispatch({ type: "SET_FIELD", key: field.key, value: String(checked) })}
                                        />
                                    </Field>
                                );
                            }

                            return (
                                <Field key={field.key} data-invalid={Boolean(err)}>
                                    <FieldLabel htmlFor={fieldId} className="font-normal">
                                        {field.label}
                                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                                    </FieldLabel>
                                    <Input
                                        id={fieldId}
                                        type={field.type === "number" ? "number" : "text"}
                                        className="font-normal"
                                        aria-invalid={Boolean(err)}
                                        value={val}
                                        onChange={(e) => dispatch({ type: "SET_FIELD", key: field.key, value: e.target.value })}
                                    />
                                    {field.hint && <FieldDescription className="font-normal">{field.hint}</FieldDescription>}
                                    <FieldError className="font-normal">{err}</FieldError>
                                </Field>
                            );
                        })}


                        {/* Enable immediately */}
                        <Field orientation="horizontal">
                            <div className="flex flex-1 flex-col gap-1">
                                <FieldLabel htmlFor="profile-enabled" className="font-normal">
                                    Start immediately{" "}
                                    <span className="text-xs text-muted-foreground ml-1">(optional)</span>
                                </FieldLabel>
                                <FieldDescription className="font-normal">Enable the profile after it is saved.</FieldDescription>
                            </div>
                            <Switch
                                id="profile-enabled"
                                checked={form.enabled}
                                onCheckedChange={(v) => dispatch({ type: "SET_ENABLED", value: v })}
                            />
                        </Field>

                        {/* Root error */}
                        {form.rootError && (
                            <Alert variant="destructive" className="mt-2">
                                <AlertTitle className="font-normal">Profile not saved</AlertTitle>
                                <AlertDescription className="font-normal text-xs">{form.rootError}</AlertDescription>
                            </Alert>
                        )}
                    </FieldGroup>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="font-normal"
                            onClick={() => handleOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saveProfile.pending} className="font-normal">
                            {saveProfile.pending
                                ? <Spinner data-icon="inline-start" />
                                : null}
                            {profile ? "Save changes" : "Save profile"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}