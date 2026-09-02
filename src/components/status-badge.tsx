import { Badge } from "@/components/ui/badge";

/**
 * Participant status.
 *
 * The schema keeps the three values from specification section 7 —
 * pending | active | withdrawn — but the interface offers two: competing, or
 * not. "On hold" is the pending value; "withdrawn" survives only so that rows
 * and audit entries written before the two were merged still read correctly.
 */
export function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return <Badge className="bg-green-600 text-white">Active</Badge>;
  }
  if (status === "withdrawn") {
    return <Badge variant="outline">Withdrawn</Badge>;
  }
  return <Badge variant="secondary">On hold</Badge>;
}

/** Daily entry status: draft | submitted | locked | missing. */
export function EntryStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "submitted":
      return <Badge className="bg-green-600 text-white">Submitted</Badge>;
    case "locked":
      return <Badge variant="outline">Locked</Badge>;
    case "missing":
      return <Badge variant="destructive">Missing</Badge>;
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
    default:
      return <Badge variant="destructive">No record</Badge>;
  }
}
