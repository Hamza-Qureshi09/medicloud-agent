import React from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { MachineResult } from "@/types/api";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EyeIcon } from "@phosphor-icons/react";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { Pagination } from "@/components/common/pagination";
import useSWR from "swr";
import { api } from "@/lib/api";

interface MachineResultsProps {
    results: MachineResult[] | undefined;
    error: unknown;
    onRetry: () => void;
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function MachineResults({
    results,
    error,
    onRetry,
    page,
    totalPages,
    onPageChange,
}: MachineResultsProps) {

    // This tab owns its own loading and error state so a failure here cannot
    // hide the sibling tab, which reads from a different database.
    if (error) return <ResourceError error={error} onRetry={onRetry} />;
    if (!results) return <PageLoading />;

    if (!results.length) {
        return (
            <ResourceEmpty
                title="No result records"
                description="Results appear here after a connected analyzer reports completed tests."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-3xl border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Result</TableHead>
                            <TableHead>Sample</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead>Analyzer</TableHead>
                            <TableHead>Analytes</TableHead>
                            <TableHead>Received</TableHead>
                            <TableHead className="text-right">Detail</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.map((result) => (
                            <TableRow key={result.id}>
                                <TableCell className="font-medium">#{result.id}</TableCell>
                                <TableCell>{result.sampleId}</TableCell>
                                <TableCell>#{result.orderId}</TableCell>
                                <TableCell>#{result.machineId}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {result.payload.results.length}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {new Date(result.receivedAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <ResultDetail result={result} />
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

// result details
function ResultDetail({ result }: { result: MachineResult }) {
    const [open, setOpen] = React.useState(false);
    const detail = useSWR(
        open ? api.results.detailKey(result.id) : null,
        () => api.results.get(result.id),
        {} // swr config for this rqst
    );
    const current = detail.data?.result ?? result;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Open result ${result.id}`}
                    />
                }
            >
                <EyeIcon />
            </DialogTrigger>

            {/* dialog content */}
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Result {current.id} · {current.sampleId}</DialogTitle>
                    <DialogDescription>
                        Immutable analyzer payload received{" "}
                        {new Date(current.receivedAt).toLocaleString()}.
                    </DialogDescription>
                </DialogHeader>

                {/* table */}
                <div className="max-h-[60vh] overflow-auto rounded-2xl border">
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
                            {current.payload.results.map((analyte, index) => (
                                <TableRow key={`${analyte.assayNo}-${index}`}>
                                    <TableCell>
                                        <p className="font-medium">
                                            {analyte.assayName || analyte.assayNo}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {analyte.assayNo}
                                        </p>
                                    </TableCell>
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
            </DialogContent>
        </Dialog>
    );
}

