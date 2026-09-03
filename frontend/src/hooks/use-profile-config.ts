import React from "react"
import type { Driver } from "@/types/api"
import {
    parseProfileConfig,
    type ParsedProfileConfig,
    type TConfig,
} from "@/lib/profile-config"


/** Hook to memoize parsed profile configuration details */
export function useProfileConfig(
    config?: TConfig,
    driver?: Driver
): ParsedProfileConfig {
    return React.useMemo(
        () => parseProfileConfig(config, driver),
        [config, driver]
    )
}