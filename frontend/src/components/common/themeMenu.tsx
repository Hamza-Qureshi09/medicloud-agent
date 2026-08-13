import { useTheme, type Theme } from "@/contexts/theme-context";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";



export function ThemeMenu() {
    const { theme, resolvedTheme, setTheme } = useTheme()
    const Icon = resolvedTheme === "dark" ? MoonIcon : SunIcon
    const options: { value: Theme; label: string }[] = [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
    ]

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button variant="outline" size="icon-sm" aria-label="Change theme" />
                }
            >
                <Icon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                    {options.map((option) => (
                        <DropdownMenuItem
                            key={option.value}
                            onClick={() => setTheme(option.value)}
                        >
                            {option.label}
                            {theme === option.value ? (
                                <Badge variant="secondary">Active</Badge>
                            ) : null}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}