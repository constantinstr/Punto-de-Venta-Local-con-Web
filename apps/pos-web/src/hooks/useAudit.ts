import { useQuery } from "@tanstack/react-query";
import type { PaginatedAuditLog } from "@pos/shared-types";
import { apiGet } from "@/lib/api";

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

function buildAuditQuery(filters: AuditFilters): string {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audit", filters],
    queryFn: () => apiGet<PaginatedAuditLog>(`/audit${buildAuditQuery(filters)}`),
  });
}
