// Plans are now managed inside Settings > Billing tab.
import { redirect } from 'next/navigation';
export default function PlansPage() {
  redirect('/settings');
}