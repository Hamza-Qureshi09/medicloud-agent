import { getOrderFormDefaults } from "./orderForm/utils"
import { TestSelector } from "./orderForm/testSelector"
import { parseTests } from "@/lib/utils"
import React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAsyncAction } from "@/hooks/use-async-action"
import type { AgentOrder, MachineOrder, MachineProfile } from "@/types/api"
import { Controller, useForm, useWatch, type SubmitHandler } from "react-hook-form"
import { orderFormSchema, orderPayload, type OrderFormValues } from "@/lib/schema"
import { extractApiError } from "@/lib/helpers"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { PencilSimpleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import useSWR from "swr"
import { ResourceEmpty } from "@/components/common/resourceState"
import { toast } from "sonner"



export function OrderForm({
    profiles,
    order,
    agentOrder,
    onSaved,
    trigger,
}: {
    profiles: MachineProfile[]
    order?: MachineOrder
    agentOrder?: AgentOrder
    onSaved: () => Promise<unknown>
    trigger?: React.ReactElement
}) {
    const [open, setOpen] = React.useState(false)
    const [loadingOrder, setLoadingOrder] = React.useState(false)
    const saveOrder = useAsyncAction("Order could not be saved.")

    const isEditing = Boolean(order?.id || agentOrder)

    const form = useForm<OrderFormValues>({
        resolver: zodResolver(orderFormSchema),
        defaultValues: getOrderFormDefaults(profiles, order),
    })

    const { data: driverData, isLoading: driversLoading, } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list(),
        { revalidateOnFocus: false },
    )

    const machineId = useWatch({ control: form.control, name: "machineId" })
    const testsValue = useWatch({ control: form.control, name: "tests" }) ?? ""

    const selectedTests = React.useMemo(() => parseTests(testsValue), [testsValue])

    const profilesById = React.useMemo(
        () => new Map(profiles.map((profile) => [String(profile.id), profile])),
        [profiles])

    const driversById = React.useMemo(
        () => new Map(driverData?.drivers.map((driver) => [driver.id, driver]) ?? []),
        [driverData?.drivers])

    const selectedProfile = profilesById.get(machineId)
    const selectedDriver = selectedProfile
        ? driversById.get(selectedProfile.driverId)
        : undefined

    const defaultOrderTests = selectedDriver?.defaultOrderTests ?? []
    const usesDefaultTests = defaultOrderTests.length > 0


    // test change handling
    const handleTestsChange = React.useCallback(
        (value: string) => {
            form.setValue("tests", value, {
                shouldValidate: true,
                shouldDirty: true,
            })
        },
        [form],
    )

    // Open/close handler
    async function changeOpen(nextOpen: boolean) {
        if (!nextOpen) {
            setOpen(false)
            return
        }

        saveOrder.reset()
        form.clearErrors()
        form.reset(getOrderFormDefaults(profiles, order))
        setOpen(true)

        const agentOrderId = agentOrder?.agentOrderId
        if (order || agentOrderId == null) return

        setLoadingOrder(true)
        try {
            const { order: latest } = await api.orders.get(agentOrderId)
            form.reset(getOrderFormDefaults(profiles, latest))
        } catch (err) {
            toast.error(extractApiError(err, "Could not load order details."))
        } finally {
            setLoadingOrder(false)
        }
    }

    // submit handler
    const onSubmit: SubmitHandler<OrderFormValues> = async (data) => {
        try {
            let hasAutomaticTests = usesDefaultTests

            if (selectedTests.length === 0 && !selectedDriver && selectedProfile) {
                const response = await api.drivers.list({ id: selectedProfile.driverId })
                hasAutomaticTests = (response.drivers[0]?.defaultOrderTests.length ?? 0) > 0
            }

            if (!hasAutomaticTests && selectedTests.length === 0) {
                form.setError("tests", {
                    message: "Select at least one test.",
                })
                return
            }

            await saveOrder.execute(async () => {
                const input = orderPayload(data, isEditing)

                // create/update
                if (agentOrder) await api.agentOrders.update(agentOrder.id, input)
                else if (order?.id) await api.orders.update(order.id, input)

                else await api.agentOrders.create(input)

                toast.success(isEditing ? "Order updated successfully." : "Order created successfully.")
                await onSaved()
                void changeOpen(false)
            })
        } catch (err) {
            const msg = extractApiError(err, "Order could not be saved.")
            toast.error(msg)
            form.setError("root", { message: msg })
        }
    }

    const dialogTrigger = trigger ?? (isEditing ? (
        <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${order?.sampleId ?? agentOrder?.dispatchId ?? "order"}`}
        >
            <PencilSimpleIcon />
        </Button>
    ) : (
        <Button size="sm" className="font-normal">
            <PlusIcon data-icon="inline-start" />
            New order
        </Button>
    ))


    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen, eventDetails) => {
                if (eventDetails.reason === "outside-press") return
                void changeOpen(nextOpen)
            }}
        >
            <DialogTrigger render={dialogTrigger} />

            <DialogContent>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>

                    <DialogHeader>
                        <DialogTitle className="font-normal">
                            {isEditing ? "Edit order" : "Create order"}
                        </DialogTitle>
                        <DialogDescription className="font-normal">
                            Active orders are staged in the target analyzer after validation.
                        </DialogDescription>
                    </DialogHeader>

                    {!isEditing && profiles.length === 0 ? (
                        <div className="py-5">
                            <ResourceEmpty
                                title="No running analyzer"
                                description="Start an analyzer profile before creating a test order."
                            />
                        </div>
                    ) : loadingOrder ? (
                        <div className="flex flex-col gap-4 py-6">
                            <Skeleton className="h-9 w-full rounded-lg" />
                            <Skeleton className="h-9 w-full rounded-lg" />
                            <Skeleton className="h-9 w-2/3 rounded-lg" />
                        </div>
                    ) : (
                        <ScrollArea className="h-[55dvh] min-h-0">
                            <FieldGroup className="py-2">

                                {/* Analyzer selector - create only */}
                                {!isEditing && (
                                    <Controller
                                        control={form.control}
                                        name="machineId"
                                        render={({ field, fieldState }) => (
                                            <Field data-invalid={fieldState.invalid} >
                                                <FieldLabel className="font-normal">
                                                    Analyzer profile{" "}
                                                    <span className="text-destructive ml-0.5">*</span>
                                                </FieldLabel>
                                                <Select
                                                    value={field.value}
                                                    disabled={driversLoading}
                                                    onValueChange={(machineId) => {
                                                        if (machineId === null) return

                                                        field.onChange(machineId)

                                                        const profile = profilesById.get(machineId)

                                                        if (!profile) {
                                                            handleTestsChange("")
                                                            return
                                                        }

                                                        const driver = driversById.get(profile.driverId)

                                                        if (driver) {
                                                            handleTestsChange(
                                                                driver.defaultOrderTests.join(", "),
                                                            )
                                                            return
                                                        }

                                                        if (!driversLoading) {
                                                            handleTestsChange("")
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger
                                                        className="w-full font-normal"
                                                        aria-invalid={fieldState.invalid}
                                                    >
                                                        <SelectValue className="font-normal">
                                                            {profilesById.get(field.value)?.name ||
                                                                "Choose an analyzer"}
                                                        </SelectValue>
                                                    </SelectTrigger>

                                                    <SelectContent>
                                                        <SelectGroup>
                                                            {profiles.map((profile) => (
                                                                <SelectItem
                                                                    key={profile.id}
                                                                    value={String(profile.id)}
                                                                    className="font-normal"
                                                                >
                                                                    {profile.name || profile.driverId}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                                <FieldError className="font-normal">
                                                    {fieldState.error?.message}
                                                </FieldError>
                                            </Field>
                                        )}
                                    />
                                )}

                                {/* Sample ID */}
                                <Field orientation={"responsive"}>
                                    <Field data-invalid={Boolean(form.formState.errors.sampleId)}>
                                        <FieldLabel htmlFor="order-sample-id" className="font-normal">
                                            Sample ID <span className="text-destructive ml-0.5">*</span>
                                        </FieldLabel>
                                        <Input
                                            id="order-sample-id"
                                            aria-invalid={Boolean(form.formState.errors.sampleId)}
                                            placeholder="Barcode / sample ID"
                                            className="font-normal"
                                            {...form.register("sampleId")}
                                        />
                                        <FieldError className="font-normal">
                                            {form.formState.errors.sampleId?.message}
                                        </FieldError>
                                    </Field>

                                    {/* Test multi-select */}
                                    <TestSelector
                                        driverId={selectedProfile?.driverId}
                                        value={testsValue}
                                        onChange={handleTestsChange}
                                        usesDefaultTests={usesDefaultTests}
                                        error={form.formState.errors.tests?.message}
                                    />
                                </Field>

                                {/* Optional 2-col fields */}
                                <Field className="grid gap-4 sm:grid-cols-2">
                                    <Field data-invalid={Boolean(form.formState.errors.patientId)}>
                                        <FieldLabel htmlFor="order-patient-id" className="font-normal">
                                            Patient ID{" "}
                                            <span className="field-optional-mark">(optional)</span>
                                        </FieldLabel>
                                        <Input
                                            id="order-patient-id"
                                            aria-invalid={Boolean(form.formState.errors.patientId)}
                                            placeholder="PAT-00123"
                                            className="font-normal"
                                            {...form.register("patientId")}
                                        />
                                        <FieldError className="font-normal">
                                            {form.formState.errors.patientId?.message}
                                        </FieldError>
                                    </Field>

                                    <Field data-invalid={Boolean(form.formState.errors.patientName)}>
                                        <FieldLabel htmlFor="order-patient-name" className="font-normal">
                                            Patient name{" "}
                                            <span className="field-optional-mark">(optional)</span>
                                        </FieldLabel>
                                        <Input
                                            id="order-patient-name"
                                            aria-invalid={Boolean(form.formState.errors.patientName)}
                                            placeholder="Full name"
                                            className="font-normal"
                                            {...form.register("patientName")}
                                        />
                                        <FieldError className="font-normal">
                                            {form.formState.errors.patientName?.message}
                                        </FieldError>
                                    </Field>

                                    <Field data-invalid={Boolean(form.formState.errors.sampleType)}>
                                        <FieldLabel htmlFor="order-sample-type" className="font-normal">
                                            Sample type{" "}
                                            <span className="field-optional-mark">(optional)</span>
                                        </FieldLabel>
                                        <Input
                                            id="order-sample-type"
                                            aria-invalid={Boolean(form.formState.errors.sampleType)}
                                            placeholder="SERUM"
                                            className="font-normal"
                                            {...form.register("sampleType")}
                                        />
                                        <FieldError className="font-normal">
                                            {form.formState.errors.sampleType?.message}
                                        </FieldError>
                                    </Field>

                                    <Field data-invalid={Boolean(form.formState.errors.rackPosition)}>
                                        <FieldLabel htmlFor="order-rack-position" className="font-normal">
                                            Rack position{" "}
                                            <span className="field-optional-mark">(optional)</span>
                                        </FieldLabel>
                                        <Input
                                            id="order-rack-position"
                                            aria-invalid={Boolean(form.formState.errors.rackPosition)}
                                            placeholder="A1"
                                            className="font-normal"
                                            {...form.register("rackPosition")}
                                        />
                                        <FieldError className="font-normal">
                                            {form.formState.errors.rackPosition?.message}
                                        </FieldError>
                                    </Field>
                                </Field>

                                {/* Expiry */}
                                <Field data-invalid={Boolean(form.formState.errors.expiresAt)}>
                                    <FieldLabel htmlFor="order-expires-at" className="font-normal">
                                        Expires at <span className="text-destructive ml-0.5">*</span>
                                    </FieldLabel>
                                    <Input
                                        id="order-expires-at"
                                        type="datetime-local"
                                        aria-invalid={Boolean(form.formState.errors.expiresAt)}
                                        className="font-normal"
                                        {...form.register("expiresAt")}
                                    />
                                    <FieldError className="font-normal">
                                        {form.formState.errors.expiresAt?.message}
                                    </FieldError>
                                </Field>

                                {/* Root error */}
                                {form.formState.errors.root?.message && (
                                    <Alert variant="destructive">
                                        <WarningCircleIcon className="size-4" />
                                        <AlertTitle className="font-normal">Order not saved</AlertTitle>
                                        <AlertDescription className="font-normal text-xs">
                                            {form.formState.errors.root.message}
                                        </AlertDescription>
                                    </Alert>
                                )}

                            </FieldGroup>
                        </ScrollArea>
                    )}

                    {/* footer */}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="font-normal"
                            onClick={() => void changeOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="font-normal"
                            disabled={
                                saveOrder.pending ||
                                loadingOrder ||
                                (!isEditing && (!profiles.length || !machineId))
                            }
                        >
                            {saveOrder.pending ? <Spinner data-icon="inline-start" /> : null}
                            {isEditing ? "Save changes" : "Create order"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
