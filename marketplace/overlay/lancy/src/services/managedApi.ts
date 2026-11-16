import { auth } from '../firebase/config';

export interface Offering { slug: string; name: string; category: string; model: string }
export interface Organization { id: string; name: string; country: string; website?: string; status: string; ownerId: string }
export interface Milestone { id: string; title: string; status: string; deliveryNote?: string; clientFeedback?: string; approvedAt?: string }
export interface Invoice { id: string; number: string; amountCents: number; currency: string; status: string }
export interface Engagement {
  id: string; title: string; brief: string; serviceSlug: string; currency: string;
  quotedCents?: number | null; status: string; managerId?: string | null;
  organization: Organization; milestones: Milestone[]; invoices: Invoice[];
}
export interface BackendUser { id: string; name: string; email: string; role: string }
const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

export async function managedApi<T>(path: string, body?: Record<string, unknown>, method?: string): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token && path !== '/managed/catalog') throw new Error('Please sign in to continue.');
  const response = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    const message = Array.isArray(json.message) ? json.message.join('; ') : json.message;
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
