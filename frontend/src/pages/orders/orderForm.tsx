import React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAsyncAction } from "@/hooks/use-async-action"
import type { CatalogTest, MachineOrder, MachineProfile } from "@/types/api"
import { Controller, useForm, useWatch, type SubmitHandler } from "react-hook-form"
import { orderFormSchema, orderPayload, type OrderFormValues } from "@/lib/schema"
import { extractApiError } from "@/lib/helpers"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { FlaskIcon, PencilSimpleIcon, PlusIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"



export function OrderForm({
    profiles,
    order,
    onSaved,
    trigger,
}: {
    profiles: MachineProfile[]
    order?: MachineOrder
    onSaved: () => Promise<unknown>
    trigger?: React.ReactElement
}) {
    const [open, setOpen] = React.useState(false)
    const saveOrder = useAsyncAction("Order could not be saved.")

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
    function changeOpen(nextOpen: boolean) {
        if (nextOpen) {
            saveOrder.reset()
            form.clearErrors()
            form.reset(getOrderFormDefaults(profiles, order))


            // // fetch latest info by calling api before showing prefilled fields
            // if (order?.id) {
            //     try {
            //         const { order: latestOrderData } = await saveOrder.execute(() => api.orders.get(order.id))
            //         form.reset(getOrderFormDefaults(profiles, latestOrderData))
            // handleTestsChange(latestOrderData.tests??[])
            //     } catch (err) {
            //         toast.error(extractApiError(err, "Could not load order details."))
            //     }
            // } else {
            //     dispatch({ type: "SET_TESTS", tests: [] })
            // }
        }
        setOpen(nextOpen)
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
                const input = orderPayload(data, Boolean(order?.id))

                // create/update
                if (order?.id) await api.orders.update(order.id, input)
                else await api.orders.create(input)

                toast.success(order?.id ? "Order updated successfully." : "Order created successfully.")
                await onSaved()
                changeOpen(false)
            })
        } catch (err) {
            const msg = extractApiError(err, "Order could not be saved.")
            toast.error(msg)
            form.setError("root", { message: msg })
        }
    }

    const dialogTrigger = trigger ?? (order ? (
        <Button variant="ghost" size="icon-xs" aria-label={`Edit ${order.sampleId}`}>
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
                changeOpen(nextOpen)
            }}
        >
            <DialogTrigger render={dialogTrigger} />

            <DialogContent>
                <form onSubmit={form.handleSubmit(onSubmit)} noValidate>

                    <DialogHeader>
                        <DialogTitle className="font-normal">
                            {order?.id ? "Edit order" : "Create order"}
                        </DialogTitle>
                        <DialogDescription className="font-normal">
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
                        <ScrollArea className="h-[55dvh] min-h-0">
                            <FieldGroup className="py-2">

                                {/* Analyzer selector - create only */}
                                {!order?.id && (
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
                            onClick={() => changeOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="font-normal"
                            disabled={saveOrder.pending || (!order && (!profiles.length || !machineId))}
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

// sub component
function TestSelector({
    driverId,
    value,
    onChange,
    usesDefaultTests,
    error,
}: {
    driverId: string | undefined
    value: string
    onChange: (value: string) => void
    usesDefaultTests: boolean
    error?: string
}) {
    const [query, setQuery] = React.useState("")

    const { data: catalogData, isLoading } = useSWR(
        (driverId && !usesDefaultTests) ? api.catalogs.detailKey(driverId) : null,
        () => api.catalogs.get({ driver: driverId! }),
        { revalidateOnFocus: false }
    )

    const selectedTests = React.useMemo(() => parseTests(value), [value])
    const selectedSet = React.useMemo(() => new Set(selectedTests), [selectedTests])

    // Resolve names once, memoised
    const allTests = React.useMemo(() =>
        Array.from(
            new Set(
                (catalogData?.tests ?? [])
                    .map(resolveTestCode)
                    .filter((test): test is string => Boolean(test)),
            ),
        ),
        [catalogData?.tests]
    )

    // Filter by search query
    const filteredTests = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        return q ? allTests.filter((n) => n?.toLowerCase().includes(q)) : allTests
    }, [allTests, query])

    const hasTests = allTests.length > 0
    const isAllSelected = React.useMemo(() => hasTests && allTests.every((test) => selectedSet.has(test)), [hasTests, allTests, selectedSet])

    const updateSelectedTests = (tests: string[]) => {
        onChange(Array.from(new Set(tests)).join(", "))
    }

    const toggleTest = (test: string) => {
        updateSelectedTests(
            selectedSet.has(test)
                ? selectedTests.filter((selectedTest) => selectedTest !== test)
                : [...selectedTests, test],
        )
    }


    // early return in case of tests are set from backend driver
    if (usesDefaultTests) {
        return (
            <Field>
                <FieldLabel className="font-normal">
                    Tests
                </FieldLabel>

                <FieldDescription className="font-normal">
                    This analyzer uses its default tests automatically.
                </FieldDescription>

                {selectedTests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {selectedTests.map((test) => (
                            <Badge
                                key={test}
                                variant="secondary"
                                className="font-normal"
                            >
                                <FlaskIcon className="size-3" />
                                {test}
                            </Badge>
                        ))}
                    </div>
                )}
            </Field>
        )
    }


    // loading 
    if (isLoading && driverId) {
        return (
            <Field data-invalid={Boolean(error)}>
                <FieldLabel className="font-normal">
                    Tests {!usesDefaultTests && <span className="text-destructive ml-0.5">*</span>}
                </FieldLabel>
                <Skeleton className="h-9 w-full rounded-lg" />
                <FieldError className="font-normal">{error}</FieldError>
            </Field>
        )
    }

    // no catalog available show plain text as fallback
    if (!driverId || !hasTests) {
        return (
            <Field data-invalid={Boolean(error)}>
                <FieldLabel className="font-normal">
                    Tests {!usesDefaultTests && <span className="text-destructive ml-0.5">*</span>}
                </FieldLabel>
                <FieldDescription className="font-normal">
                    {usesDefaultTests
                        ? "usesDefaultTests for this analyzer, its fixed panel is assigned automatically."
                        : "No catalog for this analyzer. Enter test codes separated by commas."}
                </FieldDescription>
                <Input
                    id="tests-fallback"
                    aria-invalid={Boolean(error)}
                    placeholder="e.g. TSH, FT4, Troponin-I"
                    className="font-normal"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={() => updateSelectedTests(selectedTests)} // it is not required for state synchronization. It is only useful for cleaning the free-text fallback.
                />
                <FieldError className="font-normal">{error}</FieldError>
            </Field>
        )
    }

    // multi-select
    return (
        <Field data-invalid={Boolean(error)}>
            <div className="flex items-center justify-between gap-2">
                <FieldLabel className="font-normal">
                    Tests {!usesDefaultTests && <span className="text-destructive ml-0.5">*</span>}
                </FieldLabel>
                {selectedTests.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="p-0 text-[10px] font-normal text-muted-foreground hover:text-destructive hover:bg-transparent"
                        onClick={() => updateSelectedTests([])}
                    >
                        Clear all ({selectedTests.length})
                    </Button>
                )}
            </div>


            {/* Selected badges display */}
            {selectedTests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 border border-border/50 rounded-xl bg-muted/20">
                    {selectedTests.map((test) => (
                        <Badge key={test} variant="secondary" className="gap-1 pr-1 font-normal h-6">
                            <FlaskIcon className="size-3 shrink-0" />
                            <span className="max-w-36 truncate text-xs">{test}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Remove ${test}`}
                                onClick={() =>
                                    updateSelectedTests(selectedTests.filter((selectedTest) => selectedTest !== test))
                                }
                                className="ml-0.5 rounded-full hover:bg-transparent text-muted-foreground hover:text-foreground"
                            >
                                <XIcon className="size-3" />
                            </Button>
                        </Badge>
                    ))}
                </div>
            )}

            {/* Dedicated Test Picker Modal */}
            <Dialog >

                {/* dialog trigger */}
                <DialogTrigger
                    render={
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal text-xs h-9 border-border bg-background hover:bg-muted/50"
                        >
                            <span className="flex items-center gap-2 truncate">
                                <FlaskIcon className="size-4 text-muted-foreground shrink-0" />
                                {selectedTests.length > 0
                                    ? `Add / edit tests (${selectedTests.length} selected)`
                                    : `Select tests from catalog (${allTests.length} available)`}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-normal ml-2 shrink-0">
                                {selectedTests.length} / {allTests.length}
                            </Badge>
                        </Button>
                    }
                />

                <DialogContent className="max-w-md sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-normal">Select Catalog Tests</DialogTitle>
                        <DialogDescription className="font-normal">
                            Choose tests available for this analyzer ({allTests.length} total).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3">
                        {/* Search & Select/Deselect All Actions */}
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search tests by name…"
                                className="font-normal h-8 text-xs flex-1"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoFocus
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-normal shrink-0"
                                onClick={() => updateSelectedTests(isAllSelected ? [] : allTests)}
                            >
                                {isAllSelected ? "Deselect all" : "Select all"}
                            </Button>
                        </div>

                        {/* Scrollable Test List */}
                        <ScrollArea className="h-60 rounded-xl border border-border bg-muted/20 p-2">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {filteredTests.length === 0 ? (
                                    <span className="col-span-full text-xs text-muted-foreground font-normal p-3 text-center">
                                        No tests found for &ldquo;{query}&rdquo;
                                    </span>
                                ) : (
                                    filteredTests.map((test) => {
                                        if (!test) return
                                        const isSelected = selectedSet.has(test)
                                        return (
                                            <Button
                                                key={test}
                                                type="button"
                                                variant={isSelected ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => toggleTest(test)}
                                                className={`justify-between gap-1.5 px-2.5 text-xs font-normal text-left transition-all ${isSelected
                                                    ? "bg-primary text-primary-foreground border-primary font-medium"
                                                    : "bg-background text-foreground border-border/60 hover:bg-muted/80"
                                                    }`}
                                            >
                                                <span className="truncate">{test}</span>
                                                <Checkbox
                                                    checked={isSelected}
                                                    className={`size-3.5 shrink-0 pointer-events-none ${isSelected ? "border-primary-foreground data-state=checked:bg-primary-foreground data-state=checked:text-primary" : ""}`}
                                                    tabIndex={-1}
                                                />
                                            </Button>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <DialogClose
                            render={
                                <Button type="button" className="font-normal w-full sm:w-auto">
                                    Done ({selectedTests.length} selected)
                                </Button>
                            }
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FieldError className="font-normal">{error}</FieldError>
        </Field>
    )

}


// helpers
// default form values setup
function toLocalDateTimeInputValue(date: Date): string {
    const offset = date.getTimezoneOffset() * 60_000

    return new Date(date.getTime() - offset)
        .toISOString()
        .slice(0, 16)
}

function getOrderFormDefaults(
    profiles: MachineProfile[],
    order?: MachineOrder,
): OrderFormValues {
    const expiresAt = order
        ? new Date(order.expiresAt)
        : new Date(Date.now() + 86_400_000) // 24 hours = 1 day

    return {
        machineId: String(order?.machineId ?? profiles[0]?.id ?? ""),
        sampleId: order?.sampleId ?? "",
        tests: order?.tests?.join(", ") ?? "",
        patientId: order?.patientId ?? "",
        patientName: order?.patientName ?? "",
        sampleType: order?.sampleType ?? "",
        rackPosition: order?.rackPosition ?? "",
        expiresAt: toLocalDateTimeInputValue(expiresAt)
    }
}

function resolveTestCode(test: CatalogTest): string | undefined {
    return test.code || test.name
}

function parseTests(value: string): string[] {
    return Array.from(
        new Set(
            value
                .split(",")
                .map((test) => test.trim())
                .filter(Boolean),
        ),
    )
}
