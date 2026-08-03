import React from "react";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import useSWR from "swr";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge";
import type { MachineResult } from "@/types/api";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button";
import { EyeIcon } from "@phosphor-icons/react";



export function ResultsPage() {
    const [sampleId, setSampleId] = React.useState("")

    const resultQuery = React.useMemo(() => ({ sampleId: sampleId || undefined, limit: 100 }), [sampleId])
    const {
        data: resultsData,
        isValidating: resultIsValidating,
        mutate: resultMutate,
        error: resultErrors
    } = useSWR(
        api.results.listKey(resultQuery),
        () => api.results.list(resultQuery),
        {} // swr config for this rqst
    )

    if (!resultsData && !resultErrors) return <PageLoading />
    if (resultErrors) {
        return <ResourceError error={resultErrors} onRetry={() => resultMutate()} />
    }


    return <Container>

        {/* top page details */}
        <PageSection
            eyebrow="Immutable audit"
            title="Reported analyzer results"
            description="Result records are read-only. Open a record to inspect analytes, reference ranges, units, and abnormal flags."
            actions={
                <RefreshButton
                    isLoading={resultIsValidating}
                    onRefresh={() => resultMutate()}
                />
            }
        />

        {/* sample id */}
        <Input
            className="max-w-md"
            value={sampleId}
            onChange={(event) => setSampleId(event.target.value)}
            placeholder="Filter by sample ID"
            aria-label="Filter results by sample ID"
        />

        {/*  */}
        {resultsData?.results.length ? (
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
                        {resultsData.results.map((result) => (
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
        ) : (
            <ResourceEmpty
                title="No result records"
                description="Results appear here after a connected analyzer reports completed tests."
            />
        )}
    </Container>
}


// result details
function ResultDetail({ result }: { result: MachineResult }) {
    const [open, setOpen] = React.useState(false)
    const detail = useSWR(
        open ? api.results.detailKey(result.id) : null,
        () => api.results.get(result.id),
        {} // swr config for this rqst
    )
    const current = detail.data?.result ?? result

    return (<Dialog open={open} onOpenChange={setOpen}>
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


    </Dialog>)

}