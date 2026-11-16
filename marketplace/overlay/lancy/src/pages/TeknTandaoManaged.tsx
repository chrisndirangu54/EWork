import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { managedApi } from '../services/managedApi';
import type { BackendUser, Offering, Organization, Engagement } from '../services/managedApi';

const fmt = (cents: number, currency: string) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100); }
  catch { return `${cents / 100} ${currency}`; }
};
const clean = (error: unknown) => error instanceof Error ? error.message : 'Request failed';

const catalogFallback: Offering[] = [
  { slug:'ai-automation', name:'AI Workflow Automation', category:'AI & Automation', model:'Managed project' },
  { slug:'software-engineering', name:'Managed Software Engineering', category:'Software', model:'Dedicated team or project' },
  { slug:'cloud-it-support', name:'Cloud & IT Operations', category:'Cloud', model:'Monthly retainer' },
  { slug:'data-analytics', name:'Data Engineering & Analytics', category:'Data', model:'Managed project' },
  { slug:'technical-support', name:'Technical Customer Support', category:'Support', model:'Monthly retainer' },
];
const pill = 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700';
const input = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-blue-600 focus:outline-none';
const button = 'rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50';
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

function Header() {
  const { user } = useAuth();
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
      <Link to="/services" className="text-xl font-black tracking-tight text-slate-900">Tekn<span className="text-blue-700">Tandao</span> <span className="text-sm font-medium text-slate-500">Global Services</span></Link>
      <nav aria-label="Global services" className="flex gap-5 text-sm font-medium text-slate-600">
        <Link to="/services" className="hover:text-blue-700">Managed services</Link>
        <Link to="/freelance" className="hover:text-blue-700">Hire freelancers</Link>
        <Link to={user ? '/managed' : '/login'} className="hover:text-blue-700">{user ? 'Client workspace' : 'Client sign-in'}</Link>
        <Link to="/" className="hover:text-blue-700">Marketplace</Link>
      </nav>
    </div>
  </header>;
}
function ServiceCards({ offerings }: { offerings: Offering[] }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{offerings.map(item =>
    <div key={item.slug} className={card}>
      <span className={pill}>{item.category}</span>
      <h3 className="mt-4 text-xl font-bold text-slate-900">{item.name}</h3>
      <p className="mt-2 text-sm text-slate-600">{item.model} · Dedicated delivery management · Scope-based quotation.</p>
      <Link className="mt-5 inline-block font-semibold text-blue-700" to="/managed">Request a proposal →</Link>
    </div>
  )}</div>;
}

export function TeknTandaoServices() {
  const [offerings, setOfferings] = useState<Offering[]>(catalogFallback);
  useEffect(() => { managedApi<Offering[]>('/managed/catalog').then(setOfferings).catch(() => {}); }, []);
  return <div className="min-h-screen bg-slate-50">
    <Header />
    <main>
      <section className="bg-slate-950 px-5 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <span className="text-sm font-semibold uppercase tracking-widest text-blue-300">AI-enabled outsourcing · Kenya to the world</span>
          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">Build better products. Run smarter operations. Scale with confidence.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">Vetted Kenyan technology talent, managed delivery, transparent milestones and clear accountability for clients in Europe, the UK and North America.</p>
          <Link to="/managed" className="mt-9 inline-block rounded-xl bg-blue-500 px-6 py-4 font-bold text-white hover:bg-blue-600">Start a service request</Link>
          <p className="mt-4 text-sm text-slate-400">Quotes are reviewed manually. No payments are collected through this portal.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-16">
        <h2 className="text-3xl font-black text-slate-900">Managed technology services</h2>
        <p className="mb-8 mt-3 max-w-2xl text-slate-600">Choose a managed delivery capability and describe the outcomes you need. Our team will review the requirements and prepare a custom quotation. Prefer direct hiring? Explore our verified freelancer marketplace.</p>
        <ServiceCards offerings={offerings} />
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          {['1. Define the scope', '2. Approve the quote', '3. Review delivery'].map((title, i) =>
            <div className={card} key={title}><h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{[
                'Register your organization and describe the work in a confidential request.',
                'Our delivery manager reviews your company and returns a written project quotation.',
                'Track milestones and provide explicit feedback as work is submitted.'
              ][i]}</p></div>
          )}
        </div>
      </section>
    </main>
  </div>;
}

export function TeknTandaoDashboard() {
  const { user } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>(catalogFallback);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [serviceSlug, setServiceSlug] = useState('software-engineering');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    const [me, orgs, jobs, services] = await Promise.all([
      managedApi<BackendUser>('/auth/sync', {}, 'POST'),
      managedApi<Organization[]>('/managed/organizations'),
      managedApi<Engagement[]>('/managed/engagements'),
      managedApi<Offering[]>('/managed/catalog'),
    ]);
    setBackendUser(me); setOrganizations(orgs); setEngagements(jobs); setOfferings(services);
    setOrganizationId(prev => orgs.some(o => o.id === prev) ? prev : (orgs.find(o => o.ownerId === me.id)?.id || ''));
  }, [user]);

  useEffect(() => { load().catch(e => setError(clean(e))); }, [load]);
  async function task(fn: () => Promise<unknown>, success = 'Updated successfully') {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); setNotice(success); }
    catch (e) { setError(clean(e)); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <Header />
    <main className="mx-auto max-w-7xl space-y-8 px-5 py-10">
      <div><span className={pill}>Secure client workspace</span>
        <h1 className="mt-4 text-3xl font-black">Managed services dashboard</h1>
        <p className="mt-2 text-slate-600">Welcome {backendUser?.name || user?.email}. Request services, review quotes and track delivery.</p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">{notice}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <form className={card + ' space-y-4'} onSubmit={e => { e.preventDefault(); void task(() => managedApi('/managed/organizations',{ name, country, website }), 'Company submitted for verification'); }}>
          <h2 className="text-xl font-bold">Register your company</h2>
          <p className="text-sm text-slate-600">Business verification is required before TeknTandao can issue a quote.</p>
          <label className="block text-sm font-medium">Company name<input required maxLength={120} className={input + ' mt-2'} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block text-sm font-medium">Country<input required maxLength={80} className={input + ' mt-2'} value={country} onChange={e => setCountry(e.target.value)} /></label>
          <label className="block text-sm font-medium">Company website (optional)<input type="url" placeholder="https://..." className={input + ' mt-2'} value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <button disabled={busy} className={button}>Register organization</button>
          {organizations.filter(o => o.ownerId === backendUser?.id).map(o =>
            <div key={o.id} className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span>{o.name} · {o.country}</span><span className={pill}>{o.status}</span>
            </div>)}
        </form>
        <form className={card + ' space-y-4'} onSubmit={e => { e.preventDefault(); void task(() => managedApi('/managed/engagements', { organizationId, serviceSlug, title, brief, currency }), 'Request submitted for review'); }}>
          <h2 className="text-xl font-bold">Request a managed service</h2>
          <label className="block text-sm font-medium">Organization<select required value={organizationId} onChange={e => setOrganizationId(e.target.value)} className={input + ' mt-2'}>
            <option value="">Choose an organization</option>
            {organizations.filter(o=>o.ownerId === backendUser?.id && o.status !== 'REJECTED').map(o=><option key={o.id} value={o.id}>{o.name} ({o.status})</option>)}
          </select></label>
          <label className="block text-sm font-medium">Service<select className={input + ' mt-2'} value={serviceSlug} onChange={e => setServiceSlug(e.target.value)}>
            {offerings.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select></label>
          <label className="block text-sm font-medium">Project title<input required maxLength={120} className={input + ' mt-2'} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="block text-sm font-medium">Requirements<textarea required maxLength={5000} rows={4} className={input + ' mt-2'} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Describe goals, deliverables, timeline and integrations." /></label>
          <label className="block text-sm font-medium">Quote currency<select className={input + ' mt-2'} value={currency} onChange={e=>setCurrency(e.target.value)}>
            {['USD','EUR','GBP','KES'].map(c=><option key={c}>{c}</option>)}
          </select></label>
          <button disabled={busy || !organizationId} className={button}>Request quotation</button>
          <p className="text-xs text-slate-500">Requests are not contracts. No payment is taken on submission.</p>
        </form>
      </div>
      <section className="space-y-4"><h2 className="text-2xl font-black">Engagements</h2>
        {engagements.length === 0 && <p className="text-slate-600">No service requests yet. Register your organization and submit a project brief.</p>}
        {engagements.map(e => <article key={e.id} className={card + ' space-y-4'}>
          <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-bold">{e.title}</h3>
            <p className="text-sm text-slate-500">{e.organization.name} · {e.serviceSlug}</p></div><span className={pill}>{e.status}</span></div>
          <p className="max-w-3xl whitespace-pre-wrap text-sm text-slate-700">{e.brief}</p>
          {typeof e.quotedCents === 'number' && <p className="font-semibold">Quoted: {fmt(e.quotedCents,e.currency)}</p>}
          {e.status === 'QUOTED' && e.organization.ownerId === backendUser?.id &&
            <button disabled={busy} className={button} onClick={() => void task(() => managedApi(`/managed/engagements/${e.id}/accept`,{}), 'Quote accepted; delivery awaits assignment')}>Accept quote</button>}
          {!!e.milestones.length && <div className="border-t border-slate-200 pt-4"><h4 className="font-semibold">Delivery milestones</h4>
            <div className="mt-3 space-y-3">{e.milestones.map(m => <div key={m.id} className="rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{m.title}</strong><span className={pill}>{m.status}</span></div>
              {m.deliveryNote && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{m.deliveryNote}</p>}
              {m.clientFeedback && <p className="mt-2 text-sm text-slate-600">Feedback: {m.clientFeedback}</p>}
              {m.status === 'SUBMITTED' && e.organization.ownerId === backendUser?.id && <div className="mt-3 flex gap-2">
                <button disabled={busy} className={button} onClick={() => void task(() => managedApi(`/managed/milestones/${m.id}/review`,{approved:true}), 'Milestone approved')}>Approve</button>
                <button disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2" onClick={() => {
                  const feedback = window.prompt('Describe required revisions:');
                  if (feedback?.trim()) void task(() => managedApi(`/managed/milestones/${m.id}/review`,{approved:false,clientFeedback:feedback}), 'Revision requested');
                }}>Request revision</button>
              </div>}
            </div>)}</div>
          </div>}
          {!!e.invoices.length && <div className="border-t border-slate-200 pt-4"><h4 className="font-semibold">Invoice records (not payable online)</h4>
            {e.invoices.map(i=><p key={i.id} className="mt-2 text-sm">{i.number} · {fmt(i.amountCents, i.currency)} · {i.status}</p>)}</div>}
          {backendUser?.role === 'ADMIN' && <div className="border-t border-slate-200 pt-4">
            <AdminEngagement engagement={e} me={backendUser} busy={busy} task={task} />
          </div>}
        </article>)}
      </section>
      {backendUser?.role === 'ADMIN' && <section className={card + ' space-y-4'}>
        <h2 className="text-xl font-bold">Company verification queue</h2>
        {organizations.filter(o=>o.status==='PENDING').map(o=><div key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2">
          <div><strong>{o.name}</strong> <span className="text-sm text-slate-500">{o.country}</span></div>
          <div className="flex gap-2">
            <button disabled={busy} className={button} onClick={()=>void task(()=>managedApi(`/managed/admin/organizations/${o.id}/verify`,{approved:true},'PATCH'))}>Mark verified</button>
            <button disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2" onClick={()=>void task(()=>managedApi(`/managed/admin/organizations/${o.id}/verify`,{approved:false},'PATCH'))}>Reject</button>
          </div>
        </div>)}
        <p className="text-xs text-slate-500">Verify business identity and authority externally before marking a company verified.</p>
      </section>}
    </main>
  </div>;
}
type AdminProps = { engagement: Engagement; me: BackendUser; busy: boolean;
  task: (fn: () => Promise<unknown>, success?: string) => Promise<void> };
function AdminEngagement({ engagement: e, me, busy, task }: AdminProps) {
  const [quoted, setQuoted] = useState('');
  const [milestone, setMilestone] = useState('');
  const [delivery, setDelivery] = useState<Record<string,string>>({});
  const [invoice, setInvoice] = useState('');
  return <div className="space-y-3">
    <h4 className="font-bold">Delivery operations · internal</h4>
    {e.status === 'REQUESTED' && <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void task(()=>managedApi(`/managed/admin/engagements/${e.id}/quote`,{quotedCents:Math.round(Number(quoted)*100)}),'Quote issued'); }}>
      <label className="text-sm">Quote amount ({e.currency})<input className={input} type="number" required min="0.01" step="0.01" value={quoted} onChange={event=>setQuoted(event.target.value)}/></label>
      <button disabled={busy} className={button}>Issue quote</button>
    </form>}
    {e.status === 'ACCEPTED' && <button disabled={busy} className={button} onClick={()=>void task(()=>managedApi(`/managed/admin/engagements/${e.id}/start`,{managerId:me.id}),'Engagement started')}>Assign myself as delivery manager</button>}
    {e.status === 'ACTIVE' && <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault(); void task(()=>managedApi(`/managed/admin/engagements/${e.id}/milestones`,{title:milestone}),'Milestone created');setMilestone('');}}>
      <label className="flex-1 text-sm">New milestone<input required className={input} value={milestone} onChange={event=>setMilestone(event.target.value)}/></label>
      <button disabled={busy} className={button}>Add milestone</button>
    </form>}
    {e.milestones.filter(m=>m.status==='PLANNED' && e.status==='ACTIVE').map(m=>
      <form key={m.id} className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();void task(()=>managedApi(`/managed/admin/milestones/${m.id}/submit`,{deliveryNote:delivery[m.id]}),'Milestone submitted');}}>
        <label className="flex-1 text-sm">Delivery note — {m.title}<input required className={input} value={delivery[m.id]||''} onChange={event=>setDelivery(old=>({...old,[m.id]:event.target.value}))}/></label>
        <button disabled={busy} className={button}>Submit delivery</button>
      </form>)}
    {e.status==='ACTIVE' && e.milestones.length>0 && e.milestones.every(m=>m.status==='APPROVED') &&
      <button disabled={busy} className={button} onClick={()=>void task(()=>managedApi(`/managed/admin/engagements/${e.id}/complete`,{}),'Engagement completed')}>Close engagement</button>}
    {['ACCEPTED','ACTIVE','COMPLETED'].includes(e.status) && <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault(); void task(()=>managedApi(`/managed/admin/engagements/${e.id}/invoice-drafts`,{amountCents:Math.round(Number(invoice)*100)}),'Draft invoice recorded');}}>
      <label className="text-sm">Draft invoice amount ({e.currency})<input className={input} type="number" min="0.01" step="0.01" required value={invoice} onChange={event=>setInvoice(event.target.value)}/></label>
      <button disabled={busy} className={button}>Create draft</button>
    </form>}
  </div>;
}
