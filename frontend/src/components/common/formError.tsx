import { useToastError } from "@/hooks/use-toast-error";

export function FormErrorList({ errorMessage }: { title?: string; errorMessage?: string | null }) {
  useToastError(errorMessage ? new Error(errorMessage) : null);
  return null;
}

export function ToastNotification({ message }: { title?: string; message: string | null; onClose: () => void }) {
  useToastError(message ? new Error(message) : null);
  return null;
}