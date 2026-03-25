// Subscription management is now in Settings > Billing tab.
import { redirect } from 'next/navigation';
export default function SubscriptionPage() {
  redirect('/settings');
}