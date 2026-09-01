import type { Product } from "@sale-scheduler/shared";

export interface ProductListOptions {
  ids?: number[];
  name?: string;
  modelNumber?: string;
  janCode?: string;
  limit?: number;
  offset?: number;
}

export interface ColormeRequestOptions {
  timeoutMs?: number;
  beforeRequest?: () => Promise<void>;
}

export interface ColormeShop {
  accountId: string;
  name: string;
}

export type { Product };
