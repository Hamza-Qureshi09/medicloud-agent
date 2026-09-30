import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExternalResult } from "@/types/api";
import { EyeIcon } from "@phosphor-icons/react";
import React from "react";

export function SlaveResultDetail({
    result,
    payload,
}: {
    result: ExternalResult;
    payload: Record<string, any>;
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