import React from "react";
import type { DispatchedAnalyte, ExternalResult } from "@/types/api";
import { Link } from "react-router-dom";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { ResultDeliveryStatusBadge } from "@/components/common/statusBadge";
import { Pagination } from "@/components/common/pagination";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EyeIcon } from "@phosphor-icons/react";

interface ExternalResultsProps {
    results: ExternalResult[] | undefined;
    error: unknown;
    onRetry: () => void;
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

interface ParsedPayload {
    sampleId?: string;
    analytes?: DispatchedAnalyte[];
    [key: string]: unknown;
}

function parsePayload(jsonStr: string): ParsedPayload {
    try {
        return JSON.parse(jsonStr) as ParsedPayload;
    } catch {
        return {};
    }
}

export function ExternalResults({
    results,
    error,
    onRetry,
    page,
    totalPages,
    onPageChange,
}: ExternalResultsProps) {

    // Payloads are parsed once per fetch rather than on every render.
    const rows = React.useMemo(
        () => (results ?? []).map((result) => ({ result, payload: parsePayload(result.payloadJson) })),
        [results],
    );

    // This tab owns its own loading and error state so a failure here cannot
    // hide the sibling tab, which reads from a different database.
    if (error) return <ResourceError error={error} onRetry={onRetry} />;
    if (!results) return <PageLoading />;

    if (!rows.length) {
        return (
            <ResourceEmpty
                title="No external results"
                description="No dispatched results found. Results forwarded to MediCloud or upstream agents will appear here."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-3xl border border-border bg-card relative">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-normal">Dispatch ID</TableHead>
                            <TableHead className="font-normal">Sample ID</TableHead>
                            <TableHead className="font-normal">MediCloud Order</TableHead>
                            <TableHead className="font-normal">Agent Order</TableHead>
                            <TableHead className="font-normal">Delivery Status</TableHead>
                            <TableHead className="font-normal">Retries</TableHead>
                            <TableHead className="font-normal">Created</TableHead>
                            <TableHead className="text-right font-normal">Detail</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(({ result, payload }) => (
                            <TableRow key={result.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="font-mono text-xs font-normal">
                                    {result.medicloudDispatchId}
                                </TableCell>
                                <TableCell className="font-normal">
                                    {payload.sampleId || "—"}
                                </TableCell>
                                <TableCell className="font-normal text-muted-foreground">
                                    {result.medicloudOrderId}
                                </TableCell>
                                <TableCell className="tabular-nums font-mono text-xs font-normal">
                                    {result.agentOrderId != null ? (
                                        <Link
                                            to={`/dashboard/orders/${result.agentOrderId}`}
                                            className="hover:underline hover:text-primary text-muted-foreground transition-colors font-normal"
                                        >
                                            #{result.agentOrderId}
                                        </Link>
                                    ) : "—"}
                                </TableCell>
                                <TableCell className="font-normal">
                                    <ResultDeliveryStatusBadge status={result.deliveryStatus} />
                                </TableCell>
                                <TableCell className="tabular-nums text-xs font-normal">
                                    {result.retryCount}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                    {new Date(result.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <ExternalResultDetail result={result} payload={payload} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center pt-2">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={onPageChange}
                    />
                </div>
            )}
        </div>
    );
}

function ExternalResultDetail({
    result,
    payload,
}: {
    result: ExternalResult;
    payload: ParsedPayload;
}) {
    const [open, setOpen] = React.useState(false);
    const analytes = Array.isArray(payload.analytes) ? payload.analytes : [];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Open dispatch result ${result.id}`}
                    />
                }
            >
                <EyeIcon />
            </DialogTrigger>

            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        Dispatch {result.medicloudDispatchId} {payload.sampleId ? `· ${payload.sampleId}` : ""}
                    </DialogTitle>
                    <DialogDescription>
                        Created {new Date(result.createdAt).toLocaleString()}
                        {result.sentAt ? ` · Sent ${new Date(result.sentAt).toLocaleString()}` : ""}
                    </DialogDescription>
                </DialogHeader>

                {result.errorText && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        <span className="font-semibold">Error: </span>
                        {result.errorText}
                    </div>
                )}

                {analytes.length > 0 ? (
                    <div className="max-h-[50vh] overflow-auto rounded-2xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Assay</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Flag</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {analytes.map((analyte, index) => (
                                    <TableRow key={`${analyte.assayNo}-${index}`}>
                                        {/* Dispatched payloads carry the assay number only, no name. */}
                                        <TableCell className="font-medium">{analyte.assayNo}</TableCell>
                                        <TableCell>{analyte.value || analyte.qualitative || "—"}</TableCell>
                                        <TableCell>{analyte.unit || "—"}</TableCell>
                                        <TableCell>
                                            {analyte.lowReference || analyte.highReference
                                                ? `${analyte.lowReference || "—"}–${analyte.highReference || "—"}`
                                                : "—"}
                                        </TableCell>
                                        <TableCell>
                                            {analyte.abnormalFlag ? (
                                                <Badge variant="destructive">{analyte.abnormalFlag}</Badge>
                                            ) : (
                                                <Badge variant="outline">Normal</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="max-h-[50vh] overflow-auto rounded-2xl border bg-muted/40 p-4 font-mono text-xs text-foreground">
                        <pre className="whitespace-pre-wrap">
                            {JSON.stringify(payload, null, 2)}
                        </pre>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
