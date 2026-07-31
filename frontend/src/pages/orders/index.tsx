import React, { useMemo } from "react";
import type { MachineOrder, MachineProfile, OrderStatus } from "@/types/api";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { useSearchParams, Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Controller, useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { orderFormSchema, orderPayload, type OrderFormValues, } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { ArrowCounterClockwiseIcon, PencilSimpleIcon, PlusIcon, TrashIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderStatusBadge } from "@/components/common/statusBadge";
import { ConfirmAction } from "@/components/common/confirmAction";
import { useDebounceCallback } from "@/hooks/use-debounce-callback";

export function OrdersPage() {
    const [params, setParams] = useSearchParams()
    const status = (params.get("status") || "") as OrderStatus | ""
    const sampleId = params.get("sampleId") || ""
    const [search, setSearch] = React.useState(sampleId);

    const orderQuery = React.useMemo(() => {
        return {
            status: status || undefined,
            sampleId: sampleId || undefined,
            limit: 100,
        }
    }, [status, sampleId])

    const {
        data: ordersData,
        isValidating: orderIsValidating,
        mutate: orderMutate,
        error: orderErrors
    } = useSWR(
        api.orders.listKey(orderQuery),
        () => api.orders.list(orderQuery),
        {}
    )

    const profileQuery = useMemo(() => ({ enabled: true }), [])
    const {
        data: profilesData,
        mutate: profilesMutate
    } = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
        {}
    )

    const orderAction = useAsyncAction("Order action failed.")

    // filters
    const updateFilter = React.useCallback(
        (key: string, value: string) => {
            const next = new URLSearchParams(params);

            if (value) next.set(key, value)
            else next.delete(key)

            setParams(next, { replace: true });
        },
        [params, setParams],
    );

    const debouncedUpdateFilter = useDebounceCallback(updateFilter, 400);

    if (!ordersData && !orderErrors) return <PageLoading />
    if (orderErrors) {
        return <ResourceError error={orderErrors} onRetry={() => orderMutate()} />
    }

    // actions
    async function runOrderMutation(action: () => Promise<unknown>) {
        await orderAction.execute(async () => {
            await action()
            await Promise.all([orderMutate(), profilesMutate()])
        }).catch(() => undefined)
    }

    return (
        <Container>

            {/* top page details */}
            <PageSection
                eyebrow="Worklist"
                title="Orders in motion"
                description="Search and filter state is stored in the URL, so operational views can be bookmarked and shared."
                actions={
                    <>
                        <RefreshButton
                            isLoading={orderIsValidating}
                            onRefresh={() => orderMutate()}
                        />
                        <OrderDialog
                            profiles={profilesData?.profiles.filter((profile) => profile.enabled) ?? []}
                            onSaved={orderMutate}
                        />
                    </>
                }
            />

            {/* search filter */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    aria-label="Search by sample ID"
                    placeholder="Search sample ID"
                    value={search}
                    onChange={(event) => {
                        const value = event.target.value;
                        setSearch(value);
                        debouncedUpdateFilter("sampleId", value);
                    }}
                />
                <Select
                    value={status || "all"}
                    onValueChange={(value) =>
                        updateFilter("status", value === "all" ? "" : String(value))
                    }
                >
                    <SelectTrigger className="w-full" aria-label="Filter by status">
                        <SelectValue>
                            {status
                                ? status.charAt(0).toUpperCase() + status.slice(1)
                                : "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="testing">Testing</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {/* error handling */}
            {orderAction.error ? (
                <Alert variant="destructive">
                    <AlertTitle>Order action failed</AlertTitle>
                    <AlertDescription>{orderAction.error}</AlertDescription>
                </Alert>
            ) : null}

            {/* order table */}
            {ordersData?.orders.length ? (
                <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Sample ID</TableHead>
                                <TableHead>Patient</TableHead>
                                <TableHead>Analyzer</TableHead>
                                <TableHead>Tests</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Expiry</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ordersData.orders.map((order) => (
                                <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                                    {/* Clickable Underlined Sample ID navigating to Order Details */}
                                    <TableCell className="font-semibold">
                                        <Link 
                                            to={`/dashboard/orders/${order.id}`}
                                            className="hover:underline hover:text-primary transition-colors inline-flex items-center gap-1 text-foreground"
                                        >
                                            {order.sampleId}
                                            <ArrowRightIcon className="h-3.5 w-3.5 opacity-40 hover:opacity-100" />
                                        </Link>
                                    </TableCell>

                                    <TableCell>{order.patientName || order.patientId || "—"}</TableCell>

                                    {/* Clickable Analyzer Machine ID navigating to Profile */}
                                    <TableCell className="tabular-nums font-mono text-xs">
                                        <Link 
                                            to={`/dashboard/profiles/${order.machineId}`}
                                            className="hover:underline hover:text-primary text-muted-foreground transition-colors"
                                        >
                                            #{order.machineId}
                                        </Link>
                                    </TableCell>

                                    <TableCell className="max-w-56 truncate font-medium">
                                        {order.tests.join(", ")}
                                    </TableCell>

                                    <TableCell>
                                        <OrderStatusBadge status={order.status} />
                                    </TableCell>

                                    <TableCell className="text-muted-foreground text-xs font-mono">
                                        {new Date(order.expiresAt).toLocaleString()}
                                    </TableCell>

                                    <TableCell>
                                        <div className="flex items-center justify-end gap-1">
                                            {order.status !== "completed" ? (
                                                <OrderDialog
                                                    profiles={profilesData?.profiles ?? []}
                                                    order={order}
                                                    onSaved={orderMutate}
                                                />
                                            ) : null}
                                            
                                            {(order.status === "failed" || order.status === "pending") && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    aria-label={`Resend ${order.sampleId}`}
                                                    onClick={() =>
                                                        void runOrderMutation(
                                                            () => api.orders.resend(order.id),
                                                        )
                                                    }
                                                >
                                                    <ArrowCounterClockwiseIcon />
                                                </Button>
                                            )}

                                            {order.status !== "completed" ? (
                                                <ConfirmAction
                                                    trigger={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            aria-label={`Delete ${order.sampleId}`}
                                                        >
                                                            <TrashIcon />
                                                        </Button>
                                                    }
                                                    title="Delete this order?"
                                                    description="Active orders are removed from the analyzer staging map before deletion. Completed orders remain immutable."
                                                    actionLabel="Delete order"
                                                    onConfirm={() =>
                                                        runOrderMutation(
                                                            () => api.orders.remove(order.id),
                                                        )
                                                    }
                                                />
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <ResourceEmpty
                    title="No matching orders"
                    description="Adjust the filters or create a new order for a running analyzer."
                    action={
                        <OrderDialog
                            profiles={profilesData?.profiles.filter((profile) => profile.enabled) ?? []}
                            onSaved={orderMutate}
                        />
                    }
                />
            )}
        </Container>
    )
}

function getOrderFormDefaults(defaultExpiry: string, profiles: MachineProfile[], order?: MachineOrder): OrderFormValues {
    return {
        machineId: String(order?.machineId ?? profiles[0]?.id ?? ""),
        sampleId: order?.sampleId ?? "",
        tests: order?.tests?.join(", ") ?? "",
        patientId: order?.patientId ?? "",
        patientName: order?.patientName ?? "",
        sampleType: order?.sampleType ?? "",
        rackPosition: order?.rackPosition ?? "",
        expiresAt: order
            ? new Date(order.expiresAt).toISOString().slice(0, 16)
            : defaultExpiry.slice(0, 16),
    };
}

function OrderDialog({
    profiles,
    order,
    onSaved,
}: {
    profiles: MachineProfile[]
    order?: MachineOrder
    onSaved: () => Promise<unknown>
}) {
    const [open, setOpen] = React.useState(false)
    const saveOrder = useAsyncAction("Order could not be saved.")
    const [defaultExpiry] = React.useState(() => new Date(Date.now() + 86_400_000).toISOString())

    const form = useForm<OrderFormValues>({
        resolver: zodResolver(orderFormSchema),
        defaultValues: getOrderFormDefaults(defaultExpiry, profiles, order),
    });
    const machineId = form.watch("machineId")

    async function changeOpen(nextOpen: boolean) {
        setOpen(nextOpen)

        if (nextOpen) {
            saveOrder.reset()
            form.clearErrors()
        }

        if (nextOpen && !order?.id && !form.getValues("machineId") && profiles[0]) {
            form.setValue("machineId", String(profiles[0].id))
        }

        if (nextOpen && order?.id) {
            const { order: latestOrder } = await saveOrder.execute(
                () => api.orders.get(order.id)
            )
            form.reset(getOrderFormDefaults(defaultExpiry, profiles, latestOrder))
        }
    }

    const onSubmit: SubmitHandler<OrderFormValues> = async (data) => {
        try {
            await saveOrder.execute(async () => {
                const input = orderPayload(data, Boolean(order?.id))

                if (order?.id) await api.orders.update(order.id, input)
                else await api.orders.create(input)

                await onSaved()
                setOpen(false)
            })
        } catch (error) {
            form.setError("root", {
                message:
                    error instanceof Error ? error.message : "Order could not be saved.",
            })
        }
    }

    const dialogTrigger = order ? (
        <Button variant="ghost" size="icon-xs" aria-label={`Edit ${order.sampleId}`}>
            <PencilSimpleIcon />
        </Button>
    ) : (
        <Button size="sm">
            <PlusIcon data-icon="inline-start" />
            New order
        </Button>
    )

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => void changeOpen(nextOpen)}>
            <DialogTrigger render={dialogTrigger} />

            <DialogContent>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
                    <DialogHeader>
                        <DialogTitle>{order?.id ? "Edit order" : "Create order"}</DialogTitle>
                        <DialogDescription>
                            Active orders are staged in the target analyzer after validation.
                        </DialogDescription>
                    </DialogHeader>

                    {!order?.id && profiles.length === 0 ? (
                        <div className="py-5">
                            <ResourceEmpty
                                title="No running analyzer"
                                description="Start an analyzer profile before creating a test order."
                            />
                        </div>
                    ) : (
                        <FieldGroup className="py-5">

                            {/* select analyzer (Required *) */}
                            {!order?.id ? (
                                <Controller
                                    control={form.control}
                                    name="machineId"
                                    render={({ field, fieldState }) => (
                                        <Field data-invalid={fieldState.invalid}>
                                            <FieldLabel>
                                                Analyzer profile <span className="text-destructive ml-0.5">*</span>
                                            </FieldLabel>
                                            <Select
                                                value={field.value}
                                                onValueChange={(value) => field.onChange(value ?? "")}
                                            >
                                                <SelectTrigger className="w-full" aria-invalid={fieldState.invalid}>
                                                    <SelectValue>
                                                        {profiles.find(
                                                            (profile) => String(profile.id) === field.value,
                                                        )?.name || "Choose an analyzer"}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        {profiles.map((profile) => (
                                                            <SelectItem
                                                                key={profile.id}
                                                                value={String(profile.id)}
                                                            >
                                                                {profile.name || profile.driverId}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            <FieldError>{fieldState.error?.message}</FieldError>
                                        </Field>
                                    )}
                                />
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                {/* sampleID (Required *) */}
                                <Field data-invalid={Boolean(form.formState.errors.sampleId)}>
                                    <FieldLabel htmlFor="sample-id">
                                        Sample ID <span className="text-destructive ml-0.5">*</span>
                                    </FieldLabel>
                                    <Input
                                        id="sample-id"
                                        aria-invalid={Boolean(form.formState.errors.sampleId)}
                                        placeholder="sample_id / barcode_id"
                                        required
                                        {...form.register("sampleId")}
                                    />
                                    <FieldError>
                                        {form.formState.errors.sampleId?.message}
                                    </FieldError>
                                </Field>

                                {/* Tests (Required *) */}
                                <Field data-invalid={Boolean(form.formState.errors.tests)}>
                                    <FieldLabel htmlFor="tests">
                                        Tests <span className="text-destructive ml-0.5">*</span>
                                    </FieldLabel>
                                    <Input
                                        id="tests"
                                        aria-invalid={Boolean(form.formState.errors.tests)}
                                        placeholder="TSH, FT4"
                                        required
                                        {...form.register("tests")}
                                    />
                                    <FieldError>{form.formState.errors.tests?.message}</FieldError>
                                </Field>

                                {/* patient Id (Optional) */}
                                <Field data-invalid={Boolean(form.formState.errors.patientId)}>
                                    <FieldLabel htmlFor="patient-id">
                                        Patient ID <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
                                    </FieldLabel>
                                    <Input
                                        id="patient-id"
                                        aria-invalid={Boolean(form.formState.errors.patientId)}
                                        {...form.register("patientId")}
                                    />
                                    <FieldError>
                                        {form.formState.errors.patientId?.message}
                                    </FieldError>
                                </Field>

                                {/* patient name (Optional) */}
                                <Field data-invalid={Boolean(form.formState.errors.patientName)}>
                                    <FieldLabel htmlFor="patient-name">
                                        Patient name <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
                                    </FieldLabel>
                                    <Input
                                        id="patient-name"
                                        aria-invalid={Boolean(form.formState.errors.patientName)}
                                        {...form.register("patientName")}
                                    />
                                    <FieldError>
                                        {form.formState.errors.patientName?.message}
                                    </FieldError>
                                </Field>

                                {/* sample type (Optional) */}
                                <Field data-invalid={Boolean(form.formState.errors.sampleType)}>
                                    <FieldLabel htmlFor="sample-type">
                                        Sample type <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
                                    </FieldLabel>
                                    <Input
                                        id="sample-type"
                                        aria-invalid={Boolean(form.formState.errors.sampleType)}
                                        placeholder="SERUM"
                                        {...form.register("sampleType")}
                                    />
                                    <FieldError>
                                        {form.formState.errors.sampleType?.message}
                                    </FieldError>
                                </Field>

                                {/* rack position (Optional) */}
                                <Field data-invalid={Boolean(form.formState.errors.rackPosition)}>
                                    <FieldLabel htmlFor="rack-position">
                                        Rack position <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
                                    </FieldLabel>
                                    <Input
                                        id="rack-position"
                                        aria-invalid={Boolean(form.formState.errors.rackPosition)}
                                        placeholder="A1"
                                        {...form.register("rackPosition")}
                                    />
                                    <FieldError>
                                        {form.formState.errors.rackPosition?.message}
                                    </FieldError>
                                </Field>
                            </div>

                            {/* order expire date setup (Required *) */}
                            <Field data-invalid={Boolean(form.formState.errors.expiresAt)}>
                                <FieldLabel htmlFor="expires-at">
                                    Expires at <span className="text-destructive ml-0.5">*</span>
                                </FieldLabel>
                                <Input
                                    id="expires-at"
                                    type="datetime-local"
                                    aria-invalid={Boolean(form.formState.errors.expiresAt)}
                                    required
                                    {...form.register("expiresAt")}
                                />
                                <FieldError>
                                    {form.formState.errors.expiresAt?.message}
                                </FieldError>
                            </Field>

                            {form.formState.errors.root?.message ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Order not saved</AlertTitle>
                                    <AlertDescription>
                                        {form.formState.errors.root.message}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                        </FieldGroup>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                saveOrder.pending ||
                                (!order && (!profiles.length || !machineId))
                            }
                        >
                            {saveOrder.pending ? <Spinner data-icon="inline-start" /> : null}
                            {order ? "Save changes" : "Create order"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}