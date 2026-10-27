import type { CatalogTest } from "@/types/api";
import type { CatalogTestValues } from "@/schemas/catalogs";

export function catalogTestDefaults(test?: CatalogTest): CatalogTestValues {
    return {
        code: test?.code ?? "",
        name: test?.name ?? "",
        analytes: (test?.analytes ?? [{ code: "", name: "" }]).map((analyte) => ({
            code: analyte.code,
            name: analyte.name,
            unit: analyte.unit ?? "",
            category: analyte.category ?? "",
            decimals: analyte.decimals === undefined ? "" : String(analyte.decimals),
        })),
        aliases: test?.aliases?.join(", ") ?? "",
        deviceCode: test?.deviceCode ?? "",
        unit: test?.unit ?? "",
        normalRange: test?.normalRange ?? "",
        category: test?.category ?? "",
        slot: test?.slot === undefined ? "" : String(test.slot),
        enabled: test?.enabled !== false,
    };
}

export function catalogTestPayload(values: CatalogTestValues): CatalogTest {
    return {
        code: values.code,
        name: values.name,
        analytes: values.analytes.map(({ code, name, unit, category, decimals }) => ({
            code,
            name,
            ...(unit ? { unit } : {}),
            ...(category ? { category } : {}),
            ...(decimals !== "" ? { decimals: Number(decimals) } : {}),
        })),
        aliases: values.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
        ...(values.deviceCode ? { deviceCode: values.deviceCode } : {}),
        ...(values.unit ? { unit: values.unit } : {}),
        ...(values.normalRange ? { normalRange: values.normalRange } : {}),
        ...(values.category ? { category: values.category } : {}),
        ...(values.slot !== "" ? { slot: Number(values.slot) } : {}),
        enabled: values.enabled,
    };
}
