import { redirect } from 'next/navigation';

/**
 * Unified auth: /register redirects to /login where the Sign In / Sign Up
 * toggle handles both flows.
 */
export default function RegisterPage() {
  redirect('/login');
}
