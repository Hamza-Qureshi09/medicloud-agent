import type { Driver, MachineProfile } from "@/types/api";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useProfileForm } from "@/hooks/use-profile-form";
import {
    PencilSimpleIcon,
    PlusIcon,
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
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ProfileForm({
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
                className="flex-1 sm:flex-initial font-normal cursor-pointer"
            >
                <PencilSimpleIcon className="h-4 w-4 mr-1.5" />
                Edit profile
            </Button>
        )
        : (
            <Button size="sm" className="font-normal cursor-pointer">
                <PlusIcon className="h-4 w-4 mr-1.5" />
                Add analyzer
            </Button>
        );

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen, eventDetails) => {
                if (eventDetails?.reason === "outside-press") return;
                handleOpenChange(nextOpen);
            }}
        >
            <DialogTrigger render={dialogTrigger} />

            <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl">
                <form onSubmit={handleSubmit} noValidate className="flex flex-col h-full overflow-hidden">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/45 shrink-0">
                        <DialogTitle className="font-medium text-base">
                            {profile?.id ? "Edit analyzer profile" : "Add analyzer profile"}
                        </DialogTitle>
                        <DialogDescription className="font-normal text-xs">
                            Choose a registered driver. The form adapts to show exactly what that driver needs.
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <FieldGroup className="space-y-4">

                            {/* Display Name (Optional) */}
                            <Field>
                                <FieldLabel htmlFor="profile-name" className="font-normal">
                                    Display name{" "}
                                    <span className="text-xs font-normal text-muted-foreground ">(optional)</span>
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
                                    Driver <span className="text-destructive ">*</span>
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
                                                {field.required && <span className="text-destructive ">*</span>}
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
                                            {field.hint && <FieldDescription className="text-xs text-muted-foreground">{field.hint}</FieldDescription>}
                                            <FieldError className="font-normal">{err}</FieldError>
                                        </Field>
                                    );
                                }

                                if (field.type === "boolean") {
                                    return (
                                        <Field key={field.key} orientation="horizontal" className="items-center justify-between rounded-2xl border border-border bg-muted/30 p-3">
                                            <div className="flex flex-1 flex-col gap-0.5">
                                                <FieldLabel htmlFor={fieldId} className="font-normal">{field.label}</FieldLabel>
                                                {field.hint && <FieldDescription className="text-xs text-muted-foreground">{field.hint}</FieldDescription>}
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
                                            {field.required && <span className="text-destructive ">*</span>}
                                        </FieldLabel>
                                        <Input
                                            id={fieldId}
                                            type={field.type === "number" ? "number" : "text"}
                                            aria-invalid={Boolean(err)}
                                            className="font-normal"
                                            value={val}
                                            onChange={(e) => dispatch({ type: "SET_FIELD", key: field.key, value: e.target.value })}
                                        />
                                        {field.hint && <FieldDescription className="text-xs text-muted-foreground">{field.hint}</FieldDescription>}
                                        <FieldError className="font-normal">{err}</FieldError>
                                    </Field>
                                );
                            })}

                            {/* Enable immediately */}
                            <Field orientation="horizontal" className="items-center justify-between rounded-2xl border border-border bg-muted/30 p-3">
                                <div className="flex flex-1 flex-col gap-0.5">
                                    <FieldLabel htmlFor="profile-enabled" className="font-normal">
                                        Start immediately{" "}
                                        <span className="text-xs font-normal text-muted-foreground ">(optional)</span>
                                    </FieldLabel>
                                    <FieldDescription className="text-xs text-muted-foreground">Enable the profile after it is saved.</FieldDescription>
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
                    </ScrollArea>

                    {/* profile footer */}
                    <DialogFooter className="px-6 py-4 border-t border-border/45 shrink-0 bg-muted/20">
                        <Button
                            type="button"
                            variant="outline"
                            className="font-normal cursor-pointer"
                            onClick={() => handleOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" className="font-normal cursor-pointer" disabled={saveProfile.pending}>
                            {saveProfile.pending ? <Spinner className="h-4 w-4 mr-1.5" /> : null}
                            {profile ? "Save changes" : "Save profile"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}