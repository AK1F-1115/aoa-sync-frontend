/**
 * lib/api/orders.ts
 *
 * Order management API — fetches orders and drives the AOA purchase flow.
 *
 * Endpoints:
 *   GET    /store/orders                  — paginated order list
 *   GET    /store/orders/{id}             — full order detail with line items
 *   POST   /store/orders/{id}/purchase    — charge merchant card and submit to AOA
 *   GET    /store/stripe/payment-method   — saved card info
 *   DELETE /store/stripe/payment-method   — remove saved card
 *   POST   /store/stripe/setup-intent     — create SetupIntent for card entry
 *   POST   /store/stripe/payment-method   — save a confirmed payment method
 */

import { apiFetch } from '@/lib/api/client';
import type {
  OrderListResponse,
  OrderListParams,
  OrderDetail,
  PurchaseOrderResponse,
  StripePaymentMethodResponse,
  StripeSetupIntentResponse,
  StripeSavePaymentMethodRequest,
  BulkPurchaseRequest,
  BulkPurchaseResponse,
  OrderTrackingUpdateRequest,
  OrderTrackingUpdateResponse,
} from '@/types/api';

export async function getOrders(params?: OrderListParams): Promise<OrderListResponse> {
  const query = new URLSearchParams();
  if (params?.page     != null) query.set('page',     String(params.page));
  if (params?.per_page != null) query.set('per_page', String(params.per_page));
  if (params?.status)           query.set('status',   params.status);
  if (params?.search)           query.set('search',   params.search);
  const qs = query.toString();
  return apiFetch<OrderListResponse>(`/store/orders${qs ? `?${qs}` : ''}`);
}

export async function getOrderDetail(orderId: number): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/store/orders/${orderId}`);
}

export async function purchaseOrder(orderId: number): Promise<PurchaseOrderResponse> {
  return apiFetch<PurchaseOrderResponse>(`/store/orders/${orderId}/purchase`, {
    method: 'POST',
  });
}

export async function getPaymentMethod(): Promise<StripePaymentMethodResponse> {
  return apiFetch<StripePaymentMethodResponse>('/store/stripe/payment-method');
}

export async function deletePaymentMethod(): Promise<void> {
  return apiFetch<void>('/store/stripe/payment-method', { method: 'DELETE' });
}

export async function createSetupIntent(): Promise<StripeSetupIntentResponse> {
  return apiFetch<StripeSetupIntentResponse>('/store/stripe/setup-intent', {
    method: 'POST',
  });
}

export async function savePaymentMethod(
  body: StripeSavePaymentMethodRequest
): Promise<StripePaymentMethodResponse> {
  return apiFetch<StripePaymentMethodResponse>('/store/stripe/payment-method', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Bulk-purchase multiple pending orders in a single backend call.
 *
 * Requires backend: POST /store/orders/bulk-purchase
 *   Body:     { order_ids: number[] }
 *   Response: BulkPurchaseResponse
 */
export async function bulkPurchaseOrders(orderIds: number[]): Promise<BulkPurchaseResponse> {
  return apiFetch<BulkPurchaseResponse>('/store/orders/bulk-purchase', {
    method: 'POST',
    body: JSON.stringify({ order_ids: orderIds } satisfies BulkPurchaseRequest),
  });
}

/**
 * Manually set or update the tracking number for an order.
 *
 * Requires backend: PATCH /store/orders/{id}/tracking
 *   Body:     { tracking_number: string }
 *   Response: { ok: boolean, tracking_number: string }
 */
export async function updateOrderTracking(
  orderId: number,
  trackingNumber: string,
): Promise<OrderTrackingUpdateResponse> {
  return apiFetch<OrderTrackingUpdateResponse>(`/store/orders/${orderId}/tracking`, {
    method: 'PATCH',
    body: JSON.stringify({ tracking_number: trackingNumber } satisfies OrderTrackingUpdateRequest),
  });
}
