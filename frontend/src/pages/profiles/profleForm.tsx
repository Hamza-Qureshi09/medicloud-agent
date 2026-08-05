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
                className="flex-1 sm:flex-initial font-normal"
            >
                <PencilSimpleIcon data-icon="inline-start" />
                Edit profile
            </Button>
        )
        : (
            <Button size={"sm"} >
                <PlusIcon data-icon="inline-start" />
                Add analyzer
            </Button>
        );

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen, eventDetails) => {
                if (eventDetails.reason === "outside-press") return;
                handleOpenChange(nextOpen);
            }}
        >
            <DialogTrigger render={dialogTrigger} />

            <DialogContent
            // onOutsideClick={(e) => e.preventDefault()} // to prevent closing from outside

            >
                <form onSubmit={handleSubmit} noValidate className="font-normal!">
                    <DialogHeader className="shrink-0 pb-2">
                        <DialogTitle >
                            {profile?.id
                                ? "Edit analyzer profile"
                                : "Add analyzer profile"}
                        </DialogTitle>
                        <DialogDescription >
                            Choose a registered driver. The form adapts to show exactly what that driver needs.
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="h-[50dvh] min-h-0 ">
                        <FieldGroup className="py-2">

                            {/* Display Name (Optional) */}
                            <Field>
                                <FieldLabel htmlFor="profile-name" >
                                    Display name{" "}
                                    <span className="field-optional-mark">(optional)</span>
                                </FieldLabel>
                                <Input
                                    id="profile-name"
                                    placeholder="Main chemistry analyzer"

                                    value={form.name}
                                    onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
                                />
                            </Field>

                            {/* Driver selector */}
                            <Field data-invalid={Boolean(form.errors.driverId)}>
                                <FieldLabel >
                                    Driver <span className="field-required-mark">*</span>
                                </FieldLabel>
                                <Select
                                    value={form.driverId}
                                    onValueChange={(v) => v && handleDriverChange(v)}>
                                    <SelectTrigger className="w-full" aria-invalid={Boolean(form.errors.driverId)}>
                                        <SelectValue >
                                            {selectedDriver?.brand || selectedDriver?.id || "Choose a driver"}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {drivers.map((d) => (
                                                <SelectItem key={d.id} value={d.id} >
                                                    {d.brand || d.id}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError >{form.errors.driverId}</FieldError>
                            </Field>


                            {/* Dynamic config fields */}
                            {(selectedDriver?.configFields ?? []).map((field) => {
                                const val = form.values[field.key] ?? "";
                                const err = form.errors[field.key];
                                const fieldId = `profile-config-${field.key}`;

                                if (field.type === "select" && field.options) {
                                    return (
                                        <Field key={field.key} data-invalid={Boolean(err)}>
                                            <FieldLabel htmlFor={fieldId} >
                                                {field.label}
                                                {field.required && <span className="field-required-mark">*</span>}
                                            </FieldLabel>
                                            <Select
                                                value={val}
                                                onValueChange={(v) => v !== null && dispatch({ type: "SET_FIELD", key: field.key, value: v })}
                                            >
                                                <SelectTrigger id={fieldId} className="w-full" aria-invalid={Boolean(err)}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        {field.options.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value} >
                                                                {opt.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            {field.hint && <FieldDescription >{field.hint}</FieldDescription>}
                                            <FieldError >{err}</FieldError>
                                        </Field>
                                    );
                                }

                                if (field.type === "boolean") {
                                    return (
                                        <Field key={field.key} orientation="horizontal">
                                            <div className="flex flex-1 flex-col gap-1">
                                                <FieldLabel htmlFor={fieldId} >{field.label}</FieldLabel>
                                                {field.hint && <FieldDescription >{field.hint}</FieldDescription>}
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
                                        <FieldLabel htmlFor={fieldId} >
                                            {field.label}
                                            {field.required && <span className="field-required-mark">*</span>}
                                        </FieldLabel>
                                        <Input
                                            id={fieldId}
                                            type={field.type === "number" ? "number" : "text"}

                                            aria-invalid={Boolean(err)}
                                            value={val}
                                            onChange={(e) => dispatch({ type: "SET_FIELD", key: field.key, value: e.target.value })}
                                        />
                                        {field.hint && <FieldDescription >{field.hint}</FieldDescription>}
                                        <FieldError >{err}</FieldError>
                                    </Field>
                                );
                            })}


                            {/* Enable immediately */}
                            <Field orientation="horizontal">
                                <div className="flex flex-1 flex-col gap-1">
                                    <FieldLabel htmlFor="profile-enabled" >
                                        Start immediately{" "}
                                        <span className="field-optional-mark">(optional)</span>
                                    </FieldLabel>
                                    <FieldDescription >Enable the profile after it is saved.</FieldDescription>
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
                                    <AlertTitle >Profile not saved</AlertTitle>
                                    <AlertDescription className="font-normal text-xs">{form.rootError}</AlertDescription>
                                </Alert>
                            )}
                        </FieldGroup>
                    </ScrollArea>

                    {/* profile footer */}
                    <DialogFooter className="shrink-0 pt-2">
                        <Button
                            type="button"
                            variant="outline"

                            onClick={() => handleOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saveProfile.pending} >
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