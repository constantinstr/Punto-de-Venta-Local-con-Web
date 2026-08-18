import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Category,
  Product,
  ProductDetail,
  CreateProductInput,
  UpdateProductInput,
  CreateVariantInput,
  CreateBundleItemInput,
  Store,
  StockRow,
  AdjustStockInput,
  UpdateCategoryInput,
  CreateStoreInput,
  UpdateStoreInput,
} from "@pos/shared-types";
import { apiGet, apiPost, apiPatch, apiDelete, apiPostFile } from "@/lib/api";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<Category[]>("/categories"),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; parentId?: string }) => apiPost<Category>("/categories", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      apiPatch<Category>(`/categories/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: () => apiGet<Store[]>("/stores"),
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStoreInput) => apiPost<Store>("/stores", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stores"] }),
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStoreInput }) =>
      apiPatch<Store>(`/stores/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stores"] }),
  });
}

export function useUploadStoreLogo(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiPostFile<Store>(`/stores/${storeId}/logo`, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stores"] }),
  });
}

type ProductFilters = Partial<Record<"categoryId" | "type" | "q", string>>;

function buildQuery<T extends Record<string, string | undefined>>(params: T): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => apiGet<Product[]>(`/products${buildQuery(filters)}`),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => apiGet<ProductDetail>(`/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useLowStock(storeId: string | undefined) {
  return useQuery({
    queryKey: ["products", "low-stock", storeId],
    queryFn: () => apiGet<StockRow[]>(`/products/low-stock?storeId=${storeId}`),
    enabled: Boolean(storeId),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => apiPost<Product>("/products", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProductInput) => apiPatch<Product>(`/products/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUploadProductImage(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiPostFile<Product>(`/products/${productId}/image`, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useAddVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVariantInput) => apiPost(`/products/${productId}/variants`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useRemoveVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => apiDelete(`/products/variants/${variantId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useAddBundleItem(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBundleItemInput) => apiPost(`/products/${productId}/bundle-items`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useRemoveBundleItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundleItemId: string) => apiDelete(`/products/bundle-items/${bundleItemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useStockLevels(storeId: string | undefined) {
  return useQuery({
    queryKey: ["stock", storeId],
    queryFn: () => apiGet<StockRow[]>(`/stock?storeId=${storeId}`),
    enabled: Boolean(storeId),
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) => apiPost("/stock/adjust", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
