import {
    Pagination as ShadcnPagination,
    PaginationContent,
    // PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

interface PaginationProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function Pagination({
    page,
    totalPages,
    onPageChange,
}: PaginationProps) {
    if (totalPages <= 1) return null;

    const pages = Array.from(
        { length: totalPages },
        (_, i) => i + 1
    );

    return <ShadcnPagination>
        <PaginationContent>

            {/* previous btn */}
            <PaginationItem>
                <PaginationPrevious
                    className={
                        page === 1
                            ? "pointer-events-none opacity-50 font-normal"
                            : "cursor-pointer font-normal"
                    }
                    onClick={() => onPageChange(page - 1)}
                />
            </PaginationItem>

            {/* pagination items */}
            {pages.map((p) => (
                <PaginationItem key={p}>
                    <PaginationLink
                        isActive={p === page}
                        onClick={() => onPageChange(p)}
                        className="cursor-pointer font-normal"
                    >
                        {p}
                    </PaginationLink>
                </PaginationItem>
            ))}

            {/* next btn */}
            <PaginationItem>
                <PaginationNext
                    className={
                        page === totalPages
                            ? "pointer-events-none opacity-50 font-normal"
                            : "cursor-pointer font-normal"
                    }
                    onClick={() => onPageChange(page + 1)}
                />
            </PaginationItem>

        </PaginationContent>
    </ShadcnPagination>
}