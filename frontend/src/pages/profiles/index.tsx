import { PageSection } from "@/components/common/pageSection";
import {
    PageLoading,
    RefreshButton,
    ResourceEmpty,
    ResourceError,
} from "@/components/common/resourceState";
import { useHealth } from "@/contexts/health-context";
import { useAsyncAction } from "@/hooks/use-async-action";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import {
    profileFormSchema,
    type ProfileFormValues,
    profilePayload,
} from "@/lib/schema";
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
import { Textarea } from "@/components/ui/textarea";
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

import {
    Pagination as ShadcnPagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 6;

export function ProfilesPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const { data: healthData, mutate: healthMutate } = useHealth();

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

    const totalProfiles = React.useMemo(() => {
        return profilesData?.profiles.length ?? 0;
    }, [profilesData?.profiles]);

    const totalPages = React.useMemo(() => {
        return Math.ceil(totalProfiles / ITEMS_PER_PAGE) || 1;
    }, [totalProfiles]);

    const profileAction = useAsyncAction("Analyzer action failed.");

    if (!profilesData && !profilesError) return <PageLoading />;
    if (profilesError) {
        return (
            <ResourceError
                error={profilesError}
                onRetry={() => profilesMutate()}
            />
        );
    }

    async function runProfileLifecycleAction(
        action: () => Promise<unknown>,
    ) {
        await profileAction.execute(async () => {
            await action();
            await Promise.all([
                driversMutate(),
                healthMutate(),
                profilesMutate(),
            ]);
        }).catch(() => undefined);
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
                            const matchedDriver = driversData?.drivers.find(
                                (d) => d.id === profile.driverId
                            );

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
                                                    onCreated={profilesMutate}
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
                            <ShadcnPagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={() =>
                                                setCurrentPage((prev) => Math.max(prev - 1, 1))
                                            }
                                            className={
                                                currentPage === 1
                                                    ? "pointer-events-none opacity-50 font-normal"
                                                    : "cursor-pointer font-normal"
                                            }
                                        />
                                    </PaginationItem>

                                    {Array.from(
                                        { length: totalPages },
                                        (_, i) => i + 1,
                                    ).map((page) => (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                isActive={currentPage === page}
                                                onClick={() => setCurrentPage(page)}
                                                className="cursor-pointer font-normal"
                                            >
                                                {page}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ))}

                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={() =>
                                                setCurrentPage((prev) =>
                                                    Math.min(prev + 1, totalPages)
                                                )
                                            }
                                            className={
                                                currentPage === totalPages
                                                    ? "pointer-events-none opacity-50 font-normal"
                                                    : "cursor-pointer font-normal"
                                            }
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
    const [open, setOpen] = React.useState(false);

    const saveProfile = useAsyncAction("Profile could not be saved.");

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

    async function changeOpen(nextOpen: boolean) {
        setOpen(nextOpen);

        if (nextOpen) {
            saveProfile.reset();
            form.clearErrors();
        }

        if (
            nextOpen && !profile?.id && !form.getValues("driverId") &&
            drivers[0]
        ) {
            form.setValue("driverId", drivers[0].id);
        }
    }

    const onSubmit: SubmitHandler<ProfileFormValues> = async (data) => {
        try {
            await saveProfile.execute(async () => {
                const input = profilePayload(data);

                if (profile?.id) await api.profiles.update(profile.id, input);
                else await api.profiles.create(input);

                await onCreated();
                setOpen(false);
            });
        } catch (error) {
            form.setError("root", {
                message: error instanceof Error
                    ? error.message
                    : "Profile could not be saved.",
            });
        }
    };

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

    // Formatted Error Renderer: Paragraphs and symbols (✖ / × / \n) split into List Items
    const rootErrorMessage = form.formState.errors.root?.message;
    const formattedErrorList = React.useMemo(() => {
        if (!rootErrorMessage) return [];
        return rootErrorMessage
            .split(/✖|×|\n/)
            .map((err) => err.trim())
            .filter((err) => err.length > 0);
    }, [rootErrorMessage]);

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => void changeOpen(nextOpen)}
        >
            <DialogTrigger
                render={dialogTrigger}
            />

            {/* Guaranteed Outside Click & Esc Dismiss Prevention via Radix Primative Event Overrides */}
            <DialogContent
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <DialogHeader>
                        <DialogTitle className="font-normal">
                            {profile?.id
                                ? "Edit analyzer profile"
                                : "Add analyzer profile"}
                        </DialogTitle>
                        <DialogDescription className="font-normal">
                            Choose a registered driver and provide its connection settings.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup className="py-5">
                        {/* Display Name (Optional) */}
                        <Field
                            data-invalid={Boolean(form.formState.errors.name)}
                        >
                            <FieldLabel htmlFor="profile-name" className="font-normal">
                                Display name{" "}
                                <span className="text-xs font-normal text-muted-foreground ml-1">
                                    (optional)
                                </span>
                            </FieldLabel>
                            <Input
                                id="profile-name"
                                aria-invalid={Boolean(form.formState.errors.name)}
                                placeholder="Main chemistry analyzer"
                                className="font-normal"
                                {...form.register("name")}
                            />
                            <FieldError className="font-normal">
                                {form.formState.errors.name?.message}
                            </FieldError>
                        </Field>

                        {/* Driver (Required *) */}
                        <Controller
                            control={form.control}
                            name="driverId"
                            render={({ field, fieldState }) => {
                                const selectValue =
                                    drivers.find((driver) =>
                                        driver.id === field.value
                                    )?.brand ||
                                    drivers.find((driver) =>
                                        driver.id === field.value
                                    )?.id ||
                                    "Choose a driver";

                                return (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel className="font-normal">
                                            Driver{" "}
                                            <span className="text-destructive ml-0.5">
                                                *
                                            </span>
                                        </FieldLabel>
                                        <Select
                                            value={field.value}
                                            onValueChange={(value) => field.onChange(value ?? "")}
                                        >
                                            <SelectTrigger
                                                className="w-full font-normal"
                                                aria-invalid={fieldState.invalid}
                                            >
                                                <SelectValue className="font-normal">
                                                    {selectValue}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    {drivers.map((driver) => (
                                                        <SelectItem
                                                            key={driver.id}
                                                            value={driver.id}
                                                            className="font-normal"
                                                        >
                                                            {driver.brand || driver.id}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                );
                            }}
                        />

                        {/* Config JSON (Required *) */}
                        <Field
                            data-invalid={Boolean(form.formState.errors.config)}
                        >
                            <FieldLabel htmlFor="profile-config" className="font-normal">
                                Configuration JSON{" "}
                                <span className="text-destructive ml-0.5">
                                    *
                                </span>
                            </FieldLabel>
                            <Textarea
                                id="profile-config"
                                aria-invalid={Boolean(form.formState.errors.config)}
                                rows={7}
                                className="font-normal text-xs"
                                {...form.register("config")}
                            />
                            <FieldDescription className="font-normal">
                                The selected driver validates these values before starting.
                            </FieldDescription>
                            <FieldError className="font-normal">
                                {form.formState.errors.config?.message}
                            </FieldError>
                        </Field>

                        {/* Enable Immediately (Optional) */}
                        <Controller
                            control={form.control}
                            name="enabled"
                            render={({ field }) => (
                                <Field orientation="horizontal">
                                    <div className="flex flex-1 flex-col gap-1">
                                        <FieldLabel htmlFor="profile-enabled" className="font-normal">
                                            Start immediately{" "}
                                            <span className="text-xs font-normal text-muted-foreground ml-1">
                                                (optional)
                                            </span>
                                        </FieldLabel>
                                        <FieldDescription className="font-normal">
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

                        {/* Bulleted Error Alert Box */}
                        {formattedErrorList.length > 0 ? (
                            <Alert variant="destructive" className="mt-2">
                                <AlertTitle className="font-normal">Profile not saved</AlertTitle>
                                <AlertDescription className="mt-2 text-xs leading-relaxed font-normal">
                                    <ul className="list-disc pl-4 space-y-1">
                                        {formattedErrorList.map((errItem, idx) => (
                                            <li key={idx}>{errItem}</li>
                                        ))}
                                    </ul>
                                </AlertDescription>
                            </Alert>
                        ) : null}
                    </FieldGroup>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="font-normal"
                            onClick={() => setOpen(false)}
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