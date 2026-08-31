
let shutdownStarted = false;

function removeSignalListeners(): void {
    Deno.removeSignalListener('SIGINT', onSigInt);
    if (Deno.build.os !== 'windows') {
        Deno.removeSignalListener('SIGTERM', onSigTerm);
    }
}
export function shutdown(signal: string) {
    if (shutdownStarted) return;
    shutdownStarted = true;

    removeSignalListeners();
    console.log(`${signal} received, shutting down...`);
}
export const onSigInt = () => void shutdown('SIGINT');
export const onSigTerm = () => void shutdown('SIGTERM');