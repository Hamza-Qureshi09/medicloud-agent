import React from "react";
import type { Driver, MachineProfile } from "@/types/api";
import type { ProfilePayload } from "@/lib/schema";
import { buildProfilePayload } from "@/lib/schema";
import { api } from "@/lib/api";
import { useAsyncAction } from "@/hooks/use-async-action";


interface ProfileFormState {
    driverId: string;
    values: Record<string, string>;
    name: string;
    enabled: boolean;
    errors: Record<string, string>;
    rootError: string;
}

type ProfileFormAction =
    | { type: "SWITCH_DRIVER"; driverId: string; defaults: Record<string, string> }
    | { type: "SET_FIELD"; key: string; value: string }
    | { type: "SET_NAME"; value: string }
    | { type: "SET_ENABLED"; value: boolean }
    | { type: "SET_ERRORS"; errors: Record<string, string> }
    | { type: "SET_ROOT_ERROR"; error: string }
    | { type: "RESET"; next: ProfileFormState };

export interface UseProfileFormReturn {
    form: ProfileFormState;
    dispatch: React.Dispatch<ProfileFormAction>;
    driverMap: Map<string, Driver>;
    selectedDriver: Driver | undefined;
    open: boolean;
    saveProfile: ReturnType<typeof useAsyncAction>;
    handleDriverChange: (driverId: string) => void;
    handleOpenChange: (next: boolean) => void;
    validate: () => boolean;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
}


function buildDriverMap(drivers: Driver[]): Map<string, Driver> {
    return new Map(drivers.map((d) => [d.id, d]));
}

function driverDefaults(driver: Driver | undefined, existingConfig?: unknown): Record<string, string> {
    if (!driver) return {};

    const cfg = (existingConfig && typeof existingConfig === "object")
        ? (existingConfig as Record<string, unknown>)
        : {};
    const result: Record<string, string> = {};

    for (const field of driver.configFields) {
        const value = cfg[field.key] !== undefined ? cfg[field.key] : field.default;
        result[field.key] = value !== undefined ? String(value) : "";
    }

    return result
}

function validateConfig(
    driverId: string,
    driver: Driver | undefined,
    values: Record<string, string>
): Record<string, string> {
    if (!driverId) return { driverId: "Choose a machine driver." };
    const errs: Record<string, string> = {};

    for (const field of driver?.configFields ?? []) {
        if (!field.required) continue;
        const val = (values[field.key] ?? "").trim();

        if (!val) errs[field.key] = `${field.label} is required.`;
        else if (field.type === "number" && isNaN(Number(val))) errs[field.key] = `${field.label} must be a valid number.`;
    }

    return errs;
}


function profileFormReducer(state: ProfileFormState, action: ProfileFormAction): ProfileFormState {
    switch (action.type) {
        case "SWITCH_DRIVER":
            return { ...state, driverId: action.driverId, values: action.defaults, errors: {} };
        case "SET_FIELD": {
            const errors = state.errors[action.key]
                ? Object.fromEntries(Object.entries(state.errors).filter(([k]) => k !== action.key))
                : state.errors;
            return { ...state, values: { ...state.values, [action.key]: action.value }, errors };
        }
        case "SET_NAME": return { ...state, name: action.value };
        case "SET_ENABLED": return { ...state, enabled: action.value };
        case "SET_ERRORS": return { ...state, errors: action.errors };
        case "SET_ROOT_ERROR": return { ...state, rootError: action.error };
        case "RESET": return action.next;
    }
}

export function useProfileForm(
    drivers: Driver[],
    onCreated: () => Promise<unknown>,
    profile?: MachineProfile,
): UseProfileFormReturn {
    const [open, setOpen] = React.useState(false);
    const saveProfile = useAsyncAction("Profile could not be saved.");

    const driverMap = React.useMemo(() => buildDriverMap(drivers), [drivers]);

    const makeInitialState = React.useCallback((): ProfileFormState => {
        const driverId = profile?.driverId ?? drivers[0]?.id ?? "";
        return {
            driverId,
            values: driverDefaults(driverMap.get(driverId), profile?.config),
            name: profile?.name ?? "",
            enabled: profile?.enabled ?? false,
            errors: {},
            rootError: "",
        };
    }, [driverMap, drivers, profile]);

    const [form, dispatch] = React.useReducer(profileFormReducer, undefined, makeInitialState)

    const selectedDriver = driverMap.get(form.driverId);

    function handleDriverChange(driverId: string) {
        dispatch({
            type: "SWITCH_DRIVER",
            driverId,
            defaults: driverDefaults(
                driverMap.get(driverId),
                driverId === profile?.driverId ? profile?.config : undefined
            )
        })
    }

    function handleOpenChange(next: boolean) {
        setOpen(next);
        if (next) {
            saveProfile.reset();
            dispatch({ type: "RESET", next: makeInitialState() });
        }
    }

    function validate(): boolean {
        const errors = validateConfig(form.driverId, selectedDriver, form.values);
        dispatch({ type: "SET_ERRORS", errors });
        return Object.keys(errors).length === 0;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        dispatch({ type: "SET_ROOT_ERROR", error: "" });
        if (!validate()) return;

        try {
            await saveProfile.execute(async () => {
                const payload: ProfilePayload = buildProfilePayload(
                    form.name, form.driverId, form.enabled,
                    form.values,
                    selectedDriver?.configFields ?? []
                );

                // create/update
                if (profile?.id) await api.profiles.update(profile.id, payload);
                else await api.profiles.create(payload);

                // hook call
                await onCreated();
                setOpen(false);
            });
        } catch (err) {
            dispatch({
                type: "SET_ROOT_ERROR",
                error: err instanceof Error ? err.message : "Profile could not be saved.",
            });
        }
    }

    return { form, dispatch, driverMap, selectedDriver, open, saveProfile, handleDriverChange, handleOpenChange, validate, handleSubmit };

}