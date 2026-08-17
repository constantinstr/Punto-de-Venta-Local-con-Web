import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ImportPreviewResult,
  BulkPriceUpdateInput,
  BulkPricePreviewResult,
} from "@pos/shared-types";
import { apiPostFile, apiPost, downloadFile } from "@/lib/api";

export function useDownloadImportTemplate() {
  return useMutation({
    mutationFn: () => downloadFile("/products/import/template", "plantilla-productos.xlsx"),
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (file: File) =>
      apiPostFile<ImportPreviewResult>("/products/import/preview", file),
  });
}

export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      apiPostFile<ImportPreviewResult>("/products/import/commit", file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useBulkPricePreview() {
  return useMutation({
    mutationFn: (input: BulkPriceUpdateInput) =>
      apiPost<BulkPricePreviewResult>("/products/bulk-price/preview", input),
  });
}

export function useBulkPriceApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkPriceUpdateInput) =>
      apiPost<{ updated: number }>("/products/bulk-price", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}
