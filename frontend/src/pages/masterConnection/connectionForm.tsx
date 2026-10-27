import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/helpers";
import { slaveConnectionFormSchema, type SlaveConnectionValues } from "@/schemas/slaveConnection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function AddMasterConnection(
    { disabled, defaultMasterPort, onSaved }: {
        disabled: boolean;
        defaultMasterPort: number | undefined;
        onSaved: () => Promise<unknown>;
    },
) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                disabled={disabled || defaultMasterPort === undefined}
                onClick={() => setOpen(true)}
            >
                Add master connection
            </Button>
            {open && defaultMasterPort !== undefined && (
                <MasterConnectionDialog
                    defaultMasterPort={defaultMasterPort}
                    onClose={() => setOpen(false)}
                    onSaved={onSaved}
                />
            )}
        </>
    );
}

function MasterConnectionDialog(
    { defaultMasterPort, onClose, onSaved }: {
        defaultMasterPort: number;
        onClose: () => void;
        onSaved: () => Promise<unknown>;
    },
) {
    const form = useForm<SlaveConnectionValues>({
        resolver: zodResolver(slaveConnectionFormSchema),
        defaultValues: {
            slaveName: "",
            masterHost: "",
            masterPort: defaultMasterPort,
            slaveId: "",
            slaveSecret: "",
        },
    });
    const submit = form.handleSubmit(async (values) => {
        try {
            await api.slaveConnection.save(values);
        } catch (error) {
            toast.error(extractApiError(error, "Could not add master connection"));
            return;
        }
        toast.success("Master connection added. This slave is now reporting to the master.");
        onClose();
        await onSaved().catch(() => undefined);
    }, (errors) => {
        toast.error(
            Object.values(errors).map((error) => error?.message).filter(Boolean).join(
                "\n",
            ) || "Check the connection fields",
        );
    });
    const fields = [
        ["slaveName", "Slave name", "Chemistry room PC"],
        ["masterHost", "Master host", "192.168.2.10"],
        ["masterPort", "Master port", String(defaultMasterPort)],
        ["slaveId", "Slave ID", "ID issued by the master"],
        ["slaveSecret", "Slave secret", "Secret issued by the master"],
    ] as const;
    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next && !form.formState.isSubmitting) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add master connection</DialogTitle>
                    <DialogDescription>
                        Use the credentials issued by your master. Each slave connects to one
                        master.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit}>
                    <fieldset
                        disabled={form.formState.isSubmitting}
                        className="grid gap-4"
                    >
                        {fields.map(([name, label, placeholder]) => (
                            <label key={name} className="grid gap-1 text-sm">
                                <span>{label}</span>
                                <Input
                                    {...form.register(name)}
                                    placeholder={placeholder}
                                    type={name === "slaveSecret"
                                        ? "password"
                                        : name === "masterPort"
                                        ? "number"
                                        : "text"}
                                    min={name === "masterPort" ? 1 : undefined}
                                    max={name === "masterPort" ? 65535 : undefined}
                                    aria-invalid={Boolean(form.formState.errors[name])}
                                    autoComplete={name === "slaveSecret" ? "new-password" : "off"}
                                />
                            </label>
                        ))}
                        <Button type="submit">
                            {form.formState.isSubmitting ? "Connecting..." : "Save and connect"}
                        </Button>
                    </fieldset>
                </form>
            </DialogContent>
        </Dialog>
    );
}
