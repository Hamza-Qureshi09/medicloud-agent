import React from "react"
import useSWR from "swr"
import { FlaskIcon, XIcon } from "@phosphor-icons/react"
import { api } from "@/lib/api"
import { parseTests } from "@/lib/utils"
import { resolveTestCode } from "./utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

// sub component
export function TestSelector({
    driverId,
    value,
    onChange,
    usesDefaultTests,
    error,
}: {
    driverId: string | undefined
    value: string
    onChange: (value: string) => void
    usesDefaultTests: boolean
    error?: string
}) {
    const [query, setQuery] = React.useState("")

    const { data: catalogData, isLoading } = useSWR(
        (driverId && !usesDefaultTests) ? api.catalogs.detailKey(driverId) : null,
        () => api.catalogs.get({ driver: driverId! }),
        { revalidateOnFocus: false }
    )

    const selectedTests = React.useMemo(() => parseTests(value), [value])
    const selectedSet = React.useMemo(() => new Set(selectedTests), [selectedTests])

    // Resolve names once, memoised
    const allTests = React.useMemo(() =>
        Array.from(
            new Set(
                (catalogData?.tests ?? [])
                    .filter((test) => test.enabled !== false)
                    .map(resolveTestCode)
                    .filter((test): test is string => test !== undefined && test.length > 0),
            ),
        ),
        [catalogData?.tests]
    )

    // Filter by search query
    const filteredTests = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        return q ? allTests.filter((n) => n?.toLowerCase().includes(q)) : allTests
    }, [allTests, query])

    const hasTests = allTests.length > 0
    const isAllSelected = React.useMemo(() => hasTests && allTests.every((test) => selectedSet.has(test)), [hasTests, allTests, selectedSet])

    const updateSelectedTests = (tests: string[]) => {
        onChange(Array.from(new Set(tests)).join(", "))
    }

    const toggleTest = (test: string) => {
        updateSelectedTests(
            selectedSet.has(test)
                ? selectedTests.filter((selectedTest) => selectedTest !== test)
                : [...selectedTests, test],
        )
    }


    // early return in case of tests are set from backend driver
    if (usesDefaultTests) {
        return (
            <Field>
                <FieldLabel className="font-normal">
                    Tests
                </FieldLabel>

                <FieldDescription className="font-normal">
                    This analyzer uses its default tests automatically.
                </FieldDescription>

                {selectedTests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {selectedTests.map((test) => (
                            <Badge
                                key={test}
                                variant="secondary"
                                className="font-normal"
                            >
                                <FlaskIcon className="size-3" />
                                {test}
                            </Badge>
                        ))}
                    </div>
                )}
            </Field>
        )
    }


    // loading 
    if (isLoading && driverId) {
        return (
            <Field data-invalid={Boolean(error)}>
                <FieldLabel className="font-normal">
                    Tests {!usesDefaultTests && <span className="text-destructive ml-0.5">*</span>}
                </FieldLabel>
                <Skeleton className="h-9 w-full rounded-lg" />
                <FieldError className="font-normal">{error}</FieldError>
            </Field>
        )
    }

    // no catalog available show plain text as fallback
    if (!driverId || !hasTests) {
        return (
            <Field data-invalid={Boolean(error)}>
                <FieldLabel className="font-normal">
                    Tests {!usesDefaultTests && <span className="text-destructive ml-0.5">*</span>}
                </FieldLabel>
                <FieldDescription className="font-normal">
                    {usesDefaultTests
                        ? "usesDefaultTests for this analyzer, its fixed panel is assigned automatically."
                        : "No catalog for this analyzer. Enter test codes separated by commas."}
                </FieldDescription>
                <Input
                    id="tests-fallback"
                    aria-invalid={Boolean(error)}
                    placeholder="e.g. TSH, FT4, Troponin-I"
                    className="font-normal"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={() => updateSelectedTests(selectedTests)} // it is not required for state synchronization. It is only useful for cleaning the free-text fallback.
                />
                <FieldError className="font-normal">{error}</FieldError>
            </Field>
        )
    }

    // multi-select
    return (
        <Field data-invalid={Boolean(error)}>
            <div className="flex items-center justify-between gap-2">
                <FieldLabel className="font-normal">
                    Tests {!usesDefaultTests && <span className="text-destructive ml-0.5">*</span>}
                </FieldLabel>
                {selectedTests.length > 0 && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="p-0 text-[10px] font-normal text-muted-foreground hover:text-destructive hover:bg-transparent"
                        onClick={() => updateSelectedTests([])}
                    >
                        Clear all ({selectedTests.length})
                    </Button>
                )}
            </div>


            {/* Selected badges display */}
            {selectedTests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 border border-border/50 rounded-xl bg-muted/20">
                    {selectedTests.map((test) => (
                        <Badge key={test} variant="secondary" className="gap-1 pr-1 font-normal h-6">
                            <FlaskIcon className="size-3 shrink-0" />
                            <span className="max-w-36 truncate text-xs">{test}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Remove ${test}`}
                                onClick={() =>
                                    updateSelectedTests(selectedTests.filter((selectedTest) => selectedTest !== test))
                                }
                                className="ml-0.5 rounded-full hover:bg-transparent text-muted-foreground hover:text-foreground"
                            >
                                <XIcon className="size-3" />
                            </Button>
                        </Badge>
                    ))}
                </div>
            )}

            {/* Dedicated Test Picker Modal */}
            <Dialog >

                {/* dialog trigger */}
                <DialogTrigger
                    render={
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal text-xs h-9 border-border bg-background hover:bg-muted/50"
                        >
                            <span className="flex items-center gap-2 truncate">
                                <FlaskIcon className="size-4 text-muted-foreground shrink-0" />
                                {selectedTests.length > 0
                                    ? `Add / edit tests (${selectedTests.length} selected)`
                                    : `Select tests from catalog (${allTests.length} available)`}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-normal ml-2 shrink-0">
                                {selectedTests.length} / {allTests.length}
                            </Badge>
                        </Button>
                    }
                />

                <DialogContent className="max-w-md sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-normal">Select Catalog Tests</DialogTitle>
                        <DialogDescription className="font-normal">
                            Choose tests available for this analyzer ({allTests.length} total).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3">
                        {/* Search & Select/Deselect All Actions */}
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search tests by name…"
                                className="font-normal h-8 text-xs flex-1"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoFocus
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-normal shrink-0"
                                onClick={() => updateSelectedTests(isAllSelected ? [] : allTests)}
                            >
                                {isAllSelected ? "Deselect all" : "Select all"}
                            </Button>
                        </div>

                        {/* Scrollable Test List */}
                        <ScrollArea className="h-60 rounded-xl border border-border bg-muted/20 p-2">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {filteredTests.length === 0 ? (
                                    <span className="col-span-full text-xs text-muted-foreground font-normal p-3 text-center">
                                        No tests found for &ldquo;{query}&rdquo;
                                    </span>
                                ) : (
                                    filteredTests.map((test) => {
                                        if (!test) return
                                        const isSelected = selectedSet.has(test)
                                        return (
                                            <Button
                                                key={test}
                                                type="button"
                                                variant={isSelected ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => toggleTest(test)}
                                                className={`justify-between gap-1.5 px-2.5 text-xs font-normal text-left transition-all ${isSelected
                                                    ? "bg-primary text-primary-foreground border-primary font-medium"
                                                    : "bg-background text-foreground border-border/60 hover:bg-muted/80"
                                                    }`}
                                            >
                                                <span className="truncate">{test}</span>
                                                <Checkbox
                                                    checked={isSelected}
                                                    className={`size-3.5 shrink-0 pointer-events-none ${isSelected ? "border-primary-foreground data-state=checked:bg-primary-foreground data-state=checked:text-primary" : ""}`}
                                                    tabIndex={-1}
                                                />
                                            </Button>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <DialogClose
                            render={
                                <Button type="button" className="font-normal w-full sm:w-auto">
                                    Done ({selectedTests.length} selected)
                                </Button>
                            }
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FieldError className="font-normal">{error}</FieldError>
        </Field>
    )

}


