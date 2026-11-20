import { Badge } from "@/client/components/ui/badge";
import { PROJECT_STATUS_LABELS } from "@/lib/languages";

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "done" || status === "ready"
        ? "soft"
        : "secondary";
  return (
    <Badge variant={variant} data-testid="project-status">
      {PROJECT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
