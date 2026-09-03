import { cn } from "@/lib/utils";
import type React from "react";

interface ContainerProps {
    children: React.ReactNode;
    className?: string;
}

export function Container({ children, className = "" }: ContainerProps) {
    return (
        <div className={cn(`flex flex-col gap-6`, className)}>
            {children}
        </div>
    );
}