import { useState } from "react";
import useSWR from "swr";
import { PlusIcon } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import type { CatalogTest } from "@/types/api";
import { PageLoading, ResourceError } from "@/components/common/resourceState";
import { ConfirmAction } from "@/components/common/confirmAction";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CatalogTestDialog, RenameCatalogForm } from "./forms";

export function CatalogDetailDialog({ driverId, onClose, onSaved }: {
    driverId: string;
    onClose: () => void;
    onSaved: () => Promise<unknown>;
}) {
    const { data: detail, error, mutate } = useSWR(
        api.catalogs.detailKey(driverId),
        ([, driver]) => api.catalogs.get({ driver }),
    );
    const [editor, setEditor] = useState<{ test?: CatalogTest } | null>(null);
    const managed = detail?.source === "database";
    const refresh = () => Promise.all([mutate(), onSaved()]);

    return (
        <>
            <Dialog
                open={editor === null}
                onOpenChange={(open) => {
                    if (!open && editor === null) onClose();
                }}
            >
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{detail?.machine ?? "Test catalog"}</DialogTitle>
                        <DialogDescription>
                            {driverId} · {managed ? "Stored in SQLite" : "Static and read-only"}
                        </DialogDescription>
                    </DialogHeader>
                    {error
                        ? <ResourceError error={error} onRetry={() => void mutate()} />
                        : !detail
                        ? <PageLoading rows={4} />
                        : (
                            <>
                                {managed && (
                                    <div className="flex items-end gap-2">
                                        <RenameCatalogForm
                                            key={`${driverId}:${detail.machine}`}
                                            driverId={driverId}
                                            machine={detail.machine}
                                            onSaved={refresh}
                                        />
                                        <Button type="button" onClick={() => setEditor({})}>
                                            <PlusIcon data-icon="inline-start" />Add test
                                        </Button>
                                    </div>
                                )}
                                <div className="max-h-[55vh] overflow-auto rounded-2xl border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left">
                                                <th className="p-3">Order code</th>
                                                <th className="p-3">Test</th>
                                                <th className="p-3">Results</th>
                                                <th className="p-3">State</th>
                                                {managed && <th className="p-3">Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.tests.map((test) => (
                                                <tr className="border-b" key={test.code}>
                                                    <td className="p-3 font-mono">{test.code}</td>
                                                    <td className="p-3">{test.name}</td>
                                                    <td className="p-3">
                                                        {test.analytes?.map((analyte) =>
                                                            `${
                                                                analyte.name || analyte.code
                                                            } (${analyte.code})`
                                                        ).join(
                                                            ", ",
                                                        ) || "None"}
                                                    </td>
                                                    <td className="p-3">
                                                        {test.enabled === false
                                                            ? "Disabled"
                                                            : "Active"}
                                                    </td>
                                                    {managed && (
                                                        <td className="p-3">
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        setEditor({ test })}
                                                                >
                                                                    Edit
                                                                </Button>
                                                                <ConfirmAction
                                                                    trigger={
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                        >
                                                                            Delete
                                                                        </Button>
                                                                    }
                                                                    title="Delete catalog test?"
                                                                    description={`Remove ${test.code} from this agent's catalog and future capability reports?`}
                                                                    actionLabel="Delete test"
                                                                    onConfirm={async () => {
                                                                        if (
                                                                            test.code ===
                                                                                undefined ||
                                                                            test.code.length === 0
                                                                        ) {
                                                                            throw new Error(
                                                                                "Catalog test has no order code.",
                                                                            );
                                                                        }
                                                                        await api.catalogs
                                                                            .removeTest(
                                                                                driverId,
                                                                                test.code,
                                                                            );
                                                                        await refresh();
                                                                    }}
                                                                />
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {!detail.tests.length && (
                                        <p className="p-4 text-sm text-muted-foreground">
                                            No tests yet. Add a verified order code and its result
                                            analytes.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                </DialogContent>
            </Dialog>
            {editor && (
                <CatalogTestDialog
                    driverId={driverId}
                    test={editor.test}
                    onClose={() => setEditor(null)}
                    onSaved={refresh}
                />
            )}
        </>
    );
}
