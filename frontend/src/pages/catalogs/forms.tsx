import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/helpers";
import type { CatalogTest, Driver } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    catalogTestSchema,
    type CatalogTestValues,
    createCatalogSchema,
    type CreateCatalogValues,
    renameCatalogSchema,
    type RenameCatalogValues,
} from "@/schemas/catalogs";
import { catalogTestDefaults, catalogTestPayload } from "./utils";

type Saved = () => Promise<unknown>;

export function CreateCatalogDialog({ drivers, onClose, onCreated }: {
    drivers: Driver[];
    onClose: () => void;
    onCreated: (driverId: string) => Promise<unknown>;
}) {
    const form = useForm<CreateCatalogValues>({
        resolver: zodResolver(createCatalogSchema),
        defaultValues: { driverId: "", machine: "" },
    });
    const { errors, isSubmitting } = form.formState;
    const submit = form.handleSubmit(async (values) => {
        try {
            await api.catalogs.create(values);
            await onCreated(values.driverId);
            toast.success("Catalog created. Add its verified tests before sending orders.");
        } catch (error) {
            toast.error(extractApiError(error, "Could not create catalog"));
        }
    });
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !isSubmitting) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create managed catalog</DialogTitle>
                    <DialogDescription>
                        Create a catalog for a registered driver that does not already have one.
                    </DialogDescription>
                </DialogHeader>
                {drivers.length === 0
                    ? (
                        <p className="text-sm text-muted-foreground">
                            Every registered driver already has a catalog. Register another SDK driver to create its catalog here.
                        </p>
                    )
                    : (
                        <form onSubmit={submit} className="grid gap-3">
                            <fieldset disabled={isSubmitting} className="grid gap-3">
                                <label className="grid gap-1 text-sm">
                                    <span>Driver</span>
                                    <select
                                        className="h-9 rounded-2xl bg-input/50 px-3"
                                        {...form.register("driverId")}
                                        aria-invalid={Boolean(errors.driverId)}
                                    >
                                        <option value="">Select driver</option>
                                        {drivers.map((driver) => (
                                            <option key={driver.id} value={driver.id}>
                                                {driver.brand ?? driver.id} ({driver.id})
                                            </option>
                                        ))}
                                    </select>
                                    {errors.driverId && <span role="alert">{errors.driverId.message}</span>}
                                </label>
                                <label className="grid gap-1 text-sm">
                                    <span>Machine display name</span>
                                    <Input {...form.register("machine")} aria-invalid={Boolean(errors.machine)} />
                                    {errors.machine && <span role="alert">{errors.machine.message}</span>}
                                </label>
                                <Button type="submit">{isSubmitting ? "Creating..." : "Create catalog"}</Button>
                            </fieldset>
                        </form>
                    )}
            </DialogContent>
        </Dialog>
    );
}

export function RenameCatalogForm(
    { driverId, machine, onSaved }: { driverId: string; machine: string; onSaved: Saved },
) {
    const form = useForm<RenameCatalogValues>({
        resolver: zodResolver(renameCatalogSchema),
        defaultValues: { machine },
    });
    const { errors, isSubmitting } = form.formState;
    const submit = form.handleSubmit(async (values) => {
        try {
            await api.catalogs.rename(driverId, values.machine);
            await onSaved();
            form.reset(values);
            toast.success("Catalog name updated");
        } catch (error) {
            toast.error(extractApiError(error, "Could not rename catalog"));
        }
    });
    return (
        <form onSubmit={submit} className="flex-1">
            <fieldset disabled={isSubmitting} className="flex items-end gap-2">
                <label className="grid flex-1 gap-1 text-sm">
                    <span>Machine display name</span>
                    <Input {...form.register("machine")} aria-invalid={Boolean(errors.machine)} />
                    {errors.machine && <span role="alert">{errors.machine.message}</span>}
                </label>
                <Button type="submit" variant="outline">{isSubmitting ? "Saving..." : "Save name"}</Button>
            </fieldset>
        </form>
    );
}

const testFields = [
    ["code", "Order code"],
    ["name", "Test name"],
    ["deviceCode", "Device code"],
    ["aliases", "Aliases, comma separated"],
    ["unit", "Unit"],
    ["normalRange", "Normal range"],
    ["category", "Category"],
    ["slot", "Instrument slot"],
] as const;
const analyteFields = [["code", "Analyte code"], ["name", "Analyte name"], ["unit", "Analyte unit"], [
    "category",
    "Analyte category",
], ["decimals", "Result decimals"]] as const;

export function CatalogTestDialog({ driverId, test, onClose, onSaved }: {
    driverId: string;
    test?: CatalogTest;
    onClose: () => void;
    onSaved: Saved;
}) {
    const form = useForm<CatalogTestValues>({
        resolver: zodResolver(catalogTestSchema),
        defaultValues: catalogTestDefaults(test),
    });
    const { fields, append, remove } = useFieldArray({ control: form.control, name: "analytes" });
    const { errors, isSubmitting } = form.formState;
    const submit = form.handleSubmit(async (values) => {
        try {
            const payload = catalogTestPayload(values);
            if (test?.code !== undefined && test.code.length > 0) await api.catalogs.updateTest(driverId, test.code, payload);
            else await api.catalogs.addTest(driverId, payload);
            await onSaved();
            onClose();
            toast.success("Catalog test saved");
        } catch (error) {
            toast.error(extractApiError(error, "Could not save test"));
        }
    });
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !isSubmitting) onClose();
            }}
        >
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle>{test ? "Edit catalog test" : "Add catalog test"}</DialogTitle>
                    <DialogDescription>
                        Order code is sent to the analyzer. Analyte codes identify results received from it.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit}>
                    <fieldset disabled={isSubmitting} className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            {testFields.map(([name, label]) => (
                                <label key={name} className="grid gap-1 text-sm">
                                    <span>{label}</span>
                                    <Input
                                        {...form.register(name)}
                                        readOnly={name === "code" && Boolean(test)}
                                        aria-invalid={Boolean(errors[name])}
                                    />
                                    {errors[name] && <span role="alert">{errors[name].message}</span>}
                                </label>
                            ))}
                        </div>
                        <div className="flex items-center justify-between">
                            <strong className="text-sm">Result analytes</strong>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    append({ code: "", name: "", unit: "", category: "", decimals: "" })}
                            >
                                Add analyte
                            </Button>
                        </div>
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid gap-2 rounded-2xl border p-2">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {analyteFields.map(([name, label]) => (
                                        <label key={name} className="grid gap-1 text-sm">
                                            <span>{label}</span>
                                            <Input
                                                {...form.register(`analytes.${index}.${name}`)}
                                                type={name === "decimals" ? "number" : "text"}
                                                min={name === "decimals" ? 0 : undefined}
                                                max={name === "decimals" ? 8 : undefined}
                                                aria-invalid={Boolean(errors.analytes?.[index]?.[name])}
                                            />
                                            {errors.analytes?.[index]?.[name] && (
                                                <span role="alert">
                                                    {errors.analytes[index]?.[name]?.message}
                                                </span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={fields.length === 1}
                                    onClick={() =>
                                        remove(index)}
                                >
                                    Remove
                                </Button>
                            </div>
                        ))}
                        {errors.analytes?.root && <span role="alert">{errors.analytes.root.message}</span>}
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" {...form.register("enabled")} />Available for new orders
                        </label>
                        <Button type="submit">{isSubmitting ? "Saving..." : "Save test"}</Button>
                    </fieldset>
                </form>
            </DialogContent>
        </Dialog>
    );
}
