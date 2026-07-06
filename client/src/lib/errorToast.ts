import { toast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";

export function toastApiError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  const requestId = err instanceof ApiError ? err.requestId : undefined;
  toast({
    variant: "destructive",
    title: "Something went wrong",
    description: requestId ? `${message} (Ref: ${requestId.slice(0, 8)})` : message,
  });
}
