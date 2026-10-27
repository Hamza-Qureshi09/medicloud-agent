// import { Link } from "react-router-dom";
// import { useMachineContext } from "@/contexts/machine-context";

// export function SlaveSetupNotice() {
//     const { mode, slaveConnection: { data } } = useMachineContext();
//     if (mode !== "slave" || !data || data.configured) return null;
//     return (
//         <div className="rounded-2xl border p-3 text-sm mb-2">
//             This slave has no master connection.{" "}
//             <Link className="font-medium underline" to="/dashboard/master-connection">
//                 Set up master connection
//             </Link>
//         </div>
//     );
// }


import { Link } from "react-router-dom";
import { Warning, ArrowUpRight } from "@phosphor-icons/react";
import { useMachineContext } from "@/contexts/machine-context";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export function SlaveSetupNotice() {
  const {
    mode,
    slaveConnection: { data },
  } = useMachineContext();

  if (mode !== "slave" || !data || data.configured) {
    return null;
  }

  return (
    <Alert className="mb-3 flex items-start gap-3 rounded-xl border-amber-500/30 bg-amber-500/5 px-4 py-3 [&>svg]:static [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:translate-y-0">
      <Warning
        size={18}
        weight="bold"
        className="text-amber-500"
        aria-hidden="true"
      />

      <div className="min-w-0 space-y-1">
        <AlertTitle className="mb-0 text-sm font-medium text-amber-500">
          Master connection not configured
        </AlertTitle>

        <AlertDescription className="text-sm text-muted-foreground">
          This slave has no master connection.{" "}
          <Link
            to="/dashboard/master-connection"
            className="inline-flex items-center gap-1 font-medium text-amber-500 underline underline-offset-4 decoration-amber-500/40 transition-colors hover:text-amber-400 hover:decoration-amber-400"
          >
            Set up master connection
            <ArrowUpRight
              size={14}
              weight="bold"
              aria-hidden="true"
            />
          </Link>
        </AlertDescription>
      </div>
    </Alert>
  );
}