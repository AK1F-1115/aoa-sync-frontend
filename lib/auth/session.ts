/**
 * lib/auth/session.ts
 *
 * Session abstraction layer.
 *
 * PURPOSE:
 * This module is the designated integration point for WorkOS authentication.
 * It currently acts as a typed stub that returns null for user session data.
 *
 * FUTURE (feature/workos-auth branch):
 * Replace the stub implementations here with real WorkOS SDK calls.
 * No other file should need to change for the auth integration.
 *
 * See ARCHITECTURE.md §WorkOS Integration Points for the full plan.
 */

import type { SessionUser } from '@/types/merchant';

/**
 * Retrieves the currently authenticated user session.
 *
 * Currently: always returns null (no WorkOS yet).
 * Future: calls WorkOS AuthKit to get the authenticated user,
 *         then maps the WorkOS user to SessionUser.
 *
 * @returns SessionUser if authenticated, null if not.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  /**
   * TODO(workos): Replace this stub when feature/workos-auth is implemented.
   *
   * Future implementation will look like:
   *
   * import { getUser } from '@workos-inc/authkit-nextjs';
   * const { user } = await getUser();
   * if (!user) return null;
   * return {
   *   workosUserId: user.id,
   *   email: user.email,
   *   name: `${user.firstName} ${user.lastName}`,
   *   role: mapWorkOSRoleToAppRole(user),
   * };
   */
  return null;
}

/**
 * Checks if the current user has merchant access (owns a Shopify store).
 *
 * Currently: always returns false (auth is handled entirely by App Bridge).
 * Future: queries backend for shopify_stores WHERE owner_user_id = user.id
 */
export async function isMerchant(): Promise<boolean> {
  /**
   * TODO(workos): Replace this stub.
   *
   * Future implementation:
   * const user = await getCurrentUser();
   * if (!user) return false;
   * const store = await fetchUserStore(user.workosUserId);
   * return store !== null;
   */
  return false;
}

/**
 * Checks if the current user has admin access.
 *
 * Currently: always returns false.
 * Future: checks user.role === 'admin' from WorkOS.
 */
export async function isAdmin(): Promise<boolean> {
  /**
   * TODO(workos): Replace this stub.
   */
  return false;
}
