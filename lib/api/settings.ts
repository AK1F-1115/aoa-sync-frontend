/**
 * lib/api/settings.ts
 *
 * Markup settings API — read and update per-store pricing rules.
 *
 * Endpoints:
 *   GET   /store/settings  — load current markup percentages
 *   PATCH /store/settings  — update one or more markup values
 *
 * Markup values are decimal ratios: 0.25 = 25%, 0.0 = 0%, 1.0 = 100%.
 * When updated, the backend queues a background price sync (~10 min).
 */

import { apiFetch } from './client';
import type {
  StoreSettingsResponse,
  StoreSettingsUpdateRequest,
  StoreSettingsUpdateResponse,
} from '@/types/api';

export async function getSettings(): Promise<StoreSettingsResponse> {
  return apiFetch<StoreSettingsResponse>('/store/settings');
}

export async function updateSettings(
  changes: StoreSettingsUpdateRequest
): Promise<StoreSettingsUpdateResponse> {
  return apiFetch<StoreSettingsUpdateResponse>('/store/settings', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}
