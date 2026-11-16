import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { managedApi } from '../services/managedApi';

type Package = { id: string; tier: string; description: string; priceCents: number;
  currency: string; deliveryDays: number; revisions: number };
type Seller = { id: string; userId: string; displayName: string; headline: string;
  biography: string; country: string; skills: string; status: string; gigs?: Gig[] };
type Gig = { id: string; title: string; description: string; category: string;
  tags: string; status: string; packages: Package[]; seller: Seller };
type Order = { id: string; buyerId: string; sellerId: string; priceCents: number;
  commissionCents: number; sellerNetCents: number; currency: string;
  buyerBrief: string; status: string; paymentStatus: string;
  revisionLimit: number; revisionsUsed: number; deliveryNote?: string;
  revisionFeedback?: string; seller: Seller; gig: { id: string; title: string };
  package: { tier: string; description: string }; review?: { rating: number; comment: string } | null;
  dispute?: { status: string; reason: string; decision?: string } | null };
type Message = { id: string; authorId: string; body: string; createdAt: string };
type Workspace = { seller: Seller | null; orders: Order[];
  commissionBps: number; paymentsEnabled: boolean; payoutsEnabled: boolean };
type Moderator = { id: string; orderId: string; reason: string;
  status: string; decision?: string; order: { status: string } };
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-blue-600 focus:outline-none';
const button = 'rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50';
const outlined = 'rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const badge = 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600';
const errorString = (error: unknown) => error instanceof Error ? error.message : 'Unexpected problem';
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

function Nav() {
  const { user } = useAuth();
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5">
      <Link to="/services" className="text-xl font-black text-slate-950">
        Tekn<span className="text-blue-700">Tandao</span>
        <span className="ml-2 text-sm font-medium text-slate-500">Global Services</span>
      </Link>
      <nav aria-label="Global Services" className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
        <Link className="hover:text-blue-700" to="/services">Managed outsourcing</Link>
        <Link className="hover:text-blue-700" to="/freelance">Hire a freelancer</Link>
        <Link className="hover:text-blue-700" to={user ? '/freelance/workspace' : '/login'}>
          {user ? 'Marketplace workspace' : 'Sign in'}
        </Link>
      </nav>
    </div>
  </header>;
}
function Alert({ error, notice }: { error: string; notice: string }) {
  return <>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
  </>;
}
function Notice() {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
    Development marketplace: no online payment, escrow, payouts, or subscription billing.
    Prices are indicative and clients should agree to a separately executed service contract before paid work starts.
  </div>;
}
function PackageCards({ packages }: { packages: Package[] }) {
  return <div className="grid gap-3 sm:grid-cols-3">
    {packages.map(p => <div key={p.id} className="rounded-xl border border-slate-200 p-4">
      <span className={badge}>{p.tier}</span>
      <p className="mt-2 text-lg font-bold text-slate-950">{money(p.priceCents, p.currency)}</p>
      <p className="mt-1 text-sm text-slate-600">{p.description}</p>
      <p className="mt-3 text-xs text-slate-500">{p.deliveryDays} days · {p.revisions} included revisions</p>
    </div>)}
  </div>;
}
export function FreelanceCatalog() {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    managedApi<Gig[]>('/freelance/gigs' + (search ? '?q=' + encodeURIComponent(search) : ''))
      .then(setGigs).catch(e => setError(errorString(e)));
  }, [search]);
  return <div className="min-h-screen bg-slate-50 text-slate-900"><Nav />
    <main>
      <section className="bg-slate-950 px-5 py-16 text-white">
        <div className="mx-auto max-w-7xl">
          <span className="text-sm font-semibold uppercase tracking-widest text-blue-300">Independent talent marketplace</span>
          <h1 className="mt-4 max-w-4xl text-4xl font-black md:text-6xl">Hire verified African technology talent.</h1>
          <p className="mt-5 max-w-3xl text-lg text-slate-300">
            Browse clearly scoped service packages, compare deliverables and work directly with vetted specialists.
            Prefer a fully managed project? <Link to="/services" className="font-semibold text-blue-300 underline">Choose TeknTandao managed delivery</Link>.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/freelance/workspace" className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-600">Become a seller</Link>
            <Link to="/freelance/workspace" className="rounded-xl border border-slate-400 px-6 py-3 font-semibold text-white hover:bg-slate-800">My orders</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl space-y-6 px-5 py-12">
        <Notice/>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-black">Discover freelancer services</h2>
          <form className="flex w-full max-w-lg gap-2" onSubmit={e=>{e.preventDefault();setSearch(query.trim());}}>
            <input aria-label="Search services" placeholder="Search AI, data, web development..." maxLength={80}
              className={field} value={query} onChange={e=>setQuery(e.target.value)}/>
            <button className={button}>Search</button>
          </form>
        </div>
        <Alert error={error} notice=""/>
        {gigs.length===0 && !error && <div className={card}>
          <h3 className="text-xl font-bold">No published services yet</h3>
          <p className="mt-2 text-slate-600">Seller applications are reviewed before listings appear. Try another search or explore managed outsourcing.</p>
        </div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{gigs.map(gig=>
          <article key={gig.id} className={card + ' flex flex-col gap-3'}>
            <span className={badge}>{gig.category}</span><h3 className="text-xl font-bold">{gig.title}</h3>
            <p className="line-clamp-3 text-sm text-slate-600">{gig.description}</p>
            <p className="text-sm text-slate-700">By <strong>{gig.seller.displayName}</strong> · {gig.seller.country}</p>
            <p className="text-sm text-slate-500">{gig.packages.length} package option(s) · From {gig.packages.length ? money(Math.min(...gig.packages.map(p=>p.priceCents)), gig.packages[0].currency) : 'Ask for quote'}</p>
            <Link to={`/freelance/gigs/${gig.id}`} className="mt-auto font-semibold text-blue-700">View packages →</Link>
          </article>)}</div>
      </section>
    </main>
  </div>;
}

export function FreelanceGigDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [gig, setGig] = useState<Gig | null>(null);
  const [selected, setSelected] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    managedApi<Gig>('/freelance/gigs/' + encodeURIComponent(id))
      .then(g=>{setGig(g);setSelected(g.packages[0]?.id||'');}).catch(e=>setError(errorString(e)));
  }, [id]);
  const purchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();if(!gig) return;setBusy(true);setError('');
    try{
      await managedApi('/freelance/orders',{gigId:gig.id,packageId:selected,buyerBrief:brief});
      setNotice('Service request created. The seller must accept before work begins. No payment was taken.');
      setBrief('');
    }catch(e){setError(errorString(e));}finally{setBusy(false);}
  };
  return <div className="min-h-screen bg-slate-50 text-slate-900"><Nav/>
    <main className="mx-auto max-w-6xl space-y-7 px-5 py-12">
      <Link to="/freelance" className="text-sm font-semibold text-blue-700">← Back to services</Link>
      <Alert error={error} notice={notice}/>
      {gig && <>
        <div className={card}><span className={badge}>{gig.category}</span>
          <h1 className="mt-4 text-3xl font-black">{gig.title}</h1>
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-slate-700">{gig.description}</p>
          <p className="mt-5 text-sm font-semibold text-slate-600">Seller: {gig.seller.displayName} · {gig.seller.headline} · {gig.seller.country}</p>
          <p className="mt-2 text-sm text-slate-500">Skills: {gig.seller.skills}</p>
        </div>
        <PackageCards packages={gig.packages}/>
        <Notice/>
        {user ? <form className={card + ' space-y-4'} onSubmit={purchase}>
          <h2 className="text-xl font-bold">Request this service</h2>
          <label className="block text-sm font-semibold">Choose package<select required className={field+' mt-2'} value={selected} onChange={e=>setSelected(e.target.value)}>
            {gig.packages.map(p=><option key={p.id} value={p.id}>{p.tier} — {money(p.priceCents,p.currency)}</option>)}
          </select></label>
          <label className="block text-sm font-semibold">Project brief<textarea required className={field+' mt-2'} value={brief}
            onChange={e=>setBrief(e.target.value)} maxLength={4000} rows={5} placeholder="Your objectives, requirements, timeline and acceptance criteria." /></label>
          <button className={button} disabled={busy||!selected}>{busy?'Submitting...':'Submit request — no payment'}</button>
        </form> : <div className={card}>
          <h2 className="text-xl font-bold">Sign in to submit a service request</h2>
          <Link to="/login" className="mt-3 inline-block font-semibold text-blue-700">Sign in →</Link>
        </div>}
      </>}
    </main>
  </div>;
}

function SellerApplication({ apply, busy }: { apply: (body: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [name,setName] = useState('');const [headline,setHeadline] = useState('');
  const [biography,setBiography] = useState('');const [country,setCountry] = useState('');
  const [skills,setSkills] = useState('');
  return <form className={card+' space-y-4'} onSubmit={e=>{e.preventDefault();void apply({displayName:name,headline,biography,country,skills});}}>
    <h2 className="text-xl font-bold">Apply as a freelancer</h2>
    <p className="text-sm text-slate-600">Our team reviews seller applications. Publishing requires verification.</p>
    {[
      {title:'Display name',value:name,set:setName,max:90},
      {title:'Professional headline',value:headline,set:setHeadline,max:150},
      {title:'Country',value:country,set:setCountry,max:80},
      {title:'Skills (comma-separated)',value:skills,set:setSkills,max:600}
    ].map(f=><label className="block text-sm font-semibold" key={f.title}>{f.title}
      <input required className={field+' mt-1'} value={f.value} onChange={e=>f.set(e.target.value)} maxLength={f.max}/></label>)}
    <label className="block text-sm font-semibold">Professional background<textarea required className={field+' mt-1'} maxLength={2000} value={biography} onChange={e=>setBiography(e.target.value)} rows={4}/></label>
    <button className={button} disabled={busy}>Submit seller application</button>
  </form>;
}

type NewPackage = { tier:string;description:string;price:string;currency:string;deliveryDays:string;revisions:string };
const startingPackage: NewPackage={tier:'BASIC',description:'',price:'',currency:'USD',deliveryDays:'7',revisions:'1'};
function GigCreator({ create, busy }: { create:(body: Record<string,unknown>)=>Promise<void>;busy:boolean }) {
  const [title,setTitle]=useState('');const [description,setDescription]=useState('');
  const [category,setCategory]=useState('Software Development');const [tags,setTags]=useState('');
  const [packages,setPackages]=useState<NewPackage[]>([startingPackage]);
  const setPackage=(i:number,patch:Partial<NewPackage>)=>setPackages(old=>old.map((v,j)=>j===i?{...v,...patch}:v));
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    void create({title,description,category,tags,packages:packages.map(p=>({
      tier:p.tier,description:p.description,priceCents:Math.round(Number(p.price)*100),
      currency:p.currency,deliveryDays:Number(p.deliveryDays),revisions:Number(p.revisions)
    }))});
  };
  return <form className={card+' space-y-4'} onSubmit={submit}>
    <h2 className="text-xl font-bold">Create a service listing</h2>
    <p className="text-sm text-slate-600">Every gig starts as a draft. Publish it after checking your packages.</p>
    <label className="block text-sm font-semibold">Service title<input required maxLength={160} className={field+' mt-1'} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="block text-sm font-semibold">Category<select className={field+' mt-1'} value={category} onChange={e=>setCategory(e.target.value)}>
      {['Software Development','AI & Automation','Data Science','Cloud & IT','Cybersecurity','Design','Technical Support','Research & GIS'].map(x=><option key={x}>{x}</option>)}
    </select></label>
    <label className="block text-sm font-semibold">Scope and outcomes<textarea required rows={4} maxLength={4500} className={field+' mt-1'} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label className="block text-sm font-semibold">Skill keywords<input required maxLength={400} className={field+' mt-1'} value={tags} onChange={e=>setTags(e.target.value)}/></label>
    {packages.map((p,i)=><div key={p.tier} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="font-bold">{p.tier} package</h3>
      <label className="block text-sm font-semibold">Deliverables<textarea required maxLength={1200} className={field+' mt-1'} rows={2} value={p.description} onChange={e=>setPackage(i,{description:e.target.value})}/></label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-semibold">Price<input required type="number" min="1" max="10000000" step="0.01" className={field+' mt-1'} value={p.price} onChange={e=>setPackage(i,{price:e.target.value})}/></label>
        <label className="text-sm font-semibold">Currency<select className={field+' mt-1'} value={p.currency} onChange={e=>setPackages(old=>old.map(x=>({...x,currency:e.target.value})))}>
          {['USD','EUR','GBP','KES'].map(c=><option key={c}>{c}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Days<input type="number" required min="1" max="365" className={field+' mt-1'} value={p.deliveryDays} onChange={e=>setPackage(i,{deliveryDays:e.target.value})}/></label>
        <label className="text-sm font-semibold">Revisions<input type="number" required min="0" max="20" className={field+' mt-1'} value={p.revisions} onChange={e=>setPackage(i,{revisions:e.target.value})}/></label>
      </div>
    </div>)}
    {packages.length<3 && <button type="button" className={outlined} onClick={()=>
      setPackages(old=>[...old,{...startingPackage,tier:['BASIC','STANDARD','PREMIUM'][old.length],currency:old[0].currency}])}>
      Add {['BASIC','STANDARD','PREMIUM'][packages.length]} package
    </button>}
    <button className={button} disabled={busy}>Create draft</button>
  </form>;
}

function OrderConversation({ order, currentUserId, busy, perform }: { order: Order;currentUserId:string;busy:boolean;perform:(fn:()=>Promise<unknown>,msg:string)=>Promise<void> }) {
  const [show,setShow]=useState(false);const [messages,setMessages]=useState<Message[]>([]);
  const [loading,setLoading]=useState(false);const [text,setText]=useState('');
  const fetchMessages=async()=>{setLoading(true);try{
    setMessages(await managedApi<Message[]>(`/freelance/orders/${order.id}/messages`));
  } finally {setLoading(false);} };
  return <div className="border-t border-slate-100 pt-3">
    <button className="text-sm font-semibold text-blue-700" onClick={()=>{setShow(!show);if(!show) void fetchMessages();}}>
      {show?'Hide':'View'} order messages
    </button>
    {show && <div className="mt-3 space-y-2">
      <div className="max-h-60 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {loading && <p className="text-sm">Loading messages…</p>}
        {messages.map(m=><div key={m.id} className="rounded-lg bg-white p-3 text-sm">
          <span className="font-semibold">{m.authorId===currentUserId?'You':'Other participant'}</span>
          <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
        </div>)}
        {!messages.length && !loading && <p className="text-sm text-slate-500">No messages yet.</p>}
      </div>
      <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void perform(
        ()=>managedApi(`/freelance/orders/${order.id}/messages`,{message:text}),
        'Message sent').then(()=>{setText('');void fetchMessages();});}}>
        <input aria-label="Order message" required maxLength={3000} className={field} value={text} onChange={e=>setText(e.target.value)}/>
        <button className={button} disabled={busy}>Send</button>
      </form>
    </div>}
  </div>;
}

function OrderPanel({ order, currentUserId, sellerUserId, busy, perform }: {
  order:Order;currentUserId:string;sellerUserId?:string;busy:boolean;
  perform:(fn:()=>Promise<unknown>,msg:string)=>Promise<void> }) {
  const [delivery,setDelivery]=useState('');
  const [feedback,setFeedback]=useState('');
  const [review,setReview]=useState('');
  const [rating,setRating]=useState('5');
  const [reason,setReason]=useState('');
  const seller = order.seller.userId===currentUserId;
  const buyer = order.buyerId===currentUserId;
  const call=(path:string,body:Record<string,unknown>,message:string)=>
    void perform(()=>managedApi(`/freelance/orders/${order.id}/${path}`,body),message);
  return <article className={card+' space-y-4'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-bold">{order.gig.title}</h3>
        <p className="text-sm text-slate-600">{order.package.tier} · {money(order.priceCents,order.currency)} · Seller: {order.seller.displayName}</p></div>
      <span className={badge}>{order.status}</span>
    </div>
    <p className="whitespace-pre-wrap text-sm text-slate-700">{order.buyerBrief}</p>
    {seller && <p className="text-xs text-slate-500">Potential platform fee: {money(order.commissionCents,order.currency)}; potential seller proceeds: {money(order.sellerNetCents,order.currency)}. No funds collected.</p>}
    {order.status==='REQUESTED' && seller && <div className="flex gap-2">
      <button disabled={busy} className={button} onClick={()=>call('respond',{accept:true},'Service request accepted')}>Accept request</button>
      <button disabled={busy} className={outlined} onClick={()=>call('respond',{accept:false},'Service request declined')}>Decline</button>
    </div>}
    {order.status==='REQUESTED' && buyer && <button className={outlined} disabled={busy} onClick={()=>call('cancel',{},'Request cancelled')}>Cancel request</button>}
    {seller && ['IN_PROGRESS','REVISION_REQUESTED'].includes(order.status) && <form className="space-y-2" onSubmit={e=>{e.preventDefault();call('deliver',{deliveryNote:delivery},'Delivery submitted');setDelivery('');}}>
      <label className="block text-sm font-semibold">Delivery summary and instructions<textarea className={field+' mt-2'} maxLength={5000} required value={delivery} onChange={e=>setDelivery(e.target.value)} rows={3}/></label>
      {order.revisionFeedback && <p className="text-sm text-amber-700">Client revision request: {order.revisionFeedback}</p>}
      <button disabled={busy} className={button}>Submit delivery</button>
    </form>}
    {order.deliveryNote && <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Latest delivery</strong><p className="mt-2 whitespace-pre-wrap">{order.deliveryNote}</p></div>}
    {buyer && order.status==='SUBMITTED' && <div className="space-y-3">
      <button disabled={busy} className={button} onClick={()=>call('review-delivery',{approved:true},'Delivery approved')}>Approve delivery</button>
      <form className="space-y-2" onSubmit={e=>{e.preventDefault();call('review-delivery',{approved:false,feedback},'Revision requested');}}>
        <p className="text-sm text-slate-600">Included revisions remaining: {order.revisionLimit-order.revisionsUsed}</p>
        <textarea className={field} required maxLength={2500} rows={2} placeholder="Explain required changes" value={feedback} onChange={e=>setFeedback(e.target.value)}/>
        <button disabled={busy||order.revisionsUsed>=order.revisionLimit} className={outlined}>Request revision</button>
      </form>
    </div>}
    {buyer && order.status==='COMPLETED' && !order.review && <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();call('reviews',{rating:Number(rating),comment:review},'Review posted');}}>
      <label className="text-sm font-semibold">Rating<select className={field+' mt-1'} value={rating} onChange={e=>setRating(e.target.value)}>
        {['5','4','3','2','1'].map(n=><option key={n} value={n}>{n} / 5</option>)}
      </select></label>
      <label className="min-w-52 flex-1 text-sm font-semibold">Review<input required className={field+' mt-1'} maxLength={1000} value={review} onChange={e=>setReview(e.target.value)}/></label>
      <button disabled={busy} className={button}>Publish review</button>
    </form>}
    {order.review && <p className="text-sm text-slate-600">Verified rating: {order.review.rating}/5 — {order.review.comment}</p>}
    {['IN_PROGRESS','SUBMITTED','REVISION_REQUESTED'].includes(order.status) && !order.dispute && <form className="space-y-2 border-t border-slate-200 pt-3" onSubmit={e=>{e.preventDefault();call('disputes',{reason},'Dispute opened for admin review');}}>
      <label className="block text-sm font-semibold">Report a delivery dispute<textarea required maxLength={2000} rows={2} className={field+' mt-1'} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy} className={outlined}>Open dispute</button>
    </form>}
    {order.dispute && <p className="text-sm text-amber-700">Dispute: {order.dispute.status} · {order.dispute.reason}</p>}
    {(buyer||seller||sellerUserId===currentUserId) && <OrderConversation order={order} currentUserId={currentUserId} busy={busy} perform={perform}/>}
  </article>;
}

export function FreelanceWorkspace() {
  const { user } = useAuth();
  const [state,setState]=useState<Workspace | null>(null);
  const [moderatorSellers,setModeratorSellers]=useState<Seller[]>([]);
  const [moderatorDisputes,setModeratorDisputes]=useState<Moderator[]>([]);
  const [role,setRole]=useState('FREELANCER');
  const [backendUserId,setBackendUserId]=useState('');
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async ()=>{
    if(!user)return;
    const [data,me]=await Promise.all([
      managedApi<Workspace>('/freelance/me'),
      managedApi<{role:string}>('/auth/sync',{},'POST')
    ]);
    setState(data);setRole(me.role);setBackendUserId((me as {role:string;id:string}).id);
    if(me.role==='ADMIN'){
      const [sellers,disputes]=await Promise.all([
        managedApi<Seller[]>('/freelance/admin/sellers'),
        managedApi<Moderator[]>('/freelance/admin/disputes')
      ]);
      setModeratorSellers(sellers);setModeratorDisputes(disputes);
    }
  },[user]);
  useEffect(()=>{void refresh().catch(e=>setError(errorString(e)));},[refresh]);
  async function perform(fn:()=>Promise<unknown>,message:string){
    setBusy(true);setError('');setNotice('');
    try{await fn();await refresh();setNotice(message);}
    catch(e){setError(errorString(e));}
    finally{setBusy(false);}
  }
  const seller=state?.seller;
  return <div className="min-h-screen bg-slate-50 text-slate-900"><Nav/>
    <main className="mx-auto max-w-7xl space-y-7 px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><span className={badge}>Direct-hire marketplace</span>
          <h1 className="mt-3 text-3xl font-black">Your freelancer workspace</h1>
          <p className="mt-2 text-slate-600">Manage service listings, client requests and delivery milestones.</p></div>
        <Link className={outlined} to="/freelance">Explore services</Link>
      </div>
      <Notice/><Alert error={error} notice={notice}/>
      {!seller && <SellerApplication busy={busy} apply={body=>perform(()=>managedApi('/freelance/seller/apply',body),'Seller application submitted for review')}/>}
      {seller && <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">{seller.displayName}</h2><p className="text-sm text-slate-600">{seller.headline} · {seller.country}</p></div>
          <span className={badge}>Seller status: {seller.status}</span>
        </div>
        <p className="mt-3 text-sm text-slate-600">Your listing revenue is subject to the proposed {state?.commissionBps ? state.commissionBps/100 : 12}% platform commission. No fees are being collected.</p>
      </div>}
      {seller?.status==='VERIFIED' && <GigCreator busy={busy}
        create={body=>perform(()=>managedApi('/freelance/gigs',body),'Draft service listing created')}/>}
      {!!seller?.gigs?.length && <section className="space-y-3">
        <h2 className="text-2xl font-black">My service listings</h2>
        <div className="grid gap-4 md:grid-cols-2">{seller.gigs.map(gig=><div className={card} key={gig.id}>
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{gig.title}</h3><span className={badge}>{gig.status}</span></div>
          <p className="my-3 text-sm text-slate-600">{gig.description}</p>
          <PackageCards packages={gig.packages}/>
          <div className="mt-4 flex gap-2">
            {gig.status==='DRAFT' && <button disabled={busy} className={button}
              onClick={()=>void perform(()=>managedApi(`/freelance/gigs/${gig.id}/publish`,{}),'Listing published')}>Publish</button>}
            {gig.status==='PUBLISHED' && <button disabled={busy} className={outlined}
              onClick={()=>void perform(()=>managedApi(`/freelance/gigs/${gig.id}/archive`,{}),'Listing archived')}>Archive</button>}
            {gig.status==='PUBLISHED' && <Link className={outlined} to={`/freelance/gigs/${gig.id}`}>View public listing</Link>}
          </div>
        </div>)}</div>
      </section>}
      <section className="space-y-4">
        <h2 className="text-2xl font-black">Orders and requests</h2>
        {state?.orders.length===0 && <div className={card+' text-slate-600'}>No orders yet. Browse services or publish a verified seller listing.</div>}
        {state?.orders.map(order=><OrderPanel key={order.id} order={order} currentUserId={backendUserId}
          sellerUserId={seller?.userId} busy={busy} perform={perform}/>)}
      </section>
      {role==='ADMIN' && <section className="space-y-4">
        <h2 className="text-2xl font-black">Marketplace administration</h2>
        <div className={card+' space-y-3'}>
          <h3 className="text-lg font-bold">Seller verification queue</h3>
          {moderatorSellers.filter(s=>s.status==='PENDING').length===0 && <p className="text-sm text-slate-600">No pending sellers.</p>}
          {moderatorSellers.filter(s=>s.status==='PENDING').map(s=><div key={s.id} className="space-y-2 border-b border-slate-200 pb-4">
            <div className="font-semibold">{s.displayName} · {s.country}</div>
            <p className="text-sm text-slate-600">{s.headline} — {s.biography}</p>
            <p className="text-sm text-slate-600">Skills: {s.skills}</p>
            <div className="flex gap-2">
              <button className={button} disabled={busy} onClick={()=>void perform(()=>managedApi(`/freelance/admin/sellers/${s.id}/verify`,{approved:true},'PATCH'),'Seller verified')}>Verify</button>
              <button className={outlined} disabled={busy} onClick={()=>void perform(()=>managedApi(`/freelance/admin/sellers/${s.id}/verify`,{approved:false},'PATCH'),'Seller rejected')}>Reject</button>
            </div>
          </div>)}
          <p className="text-xs text-slate-500">Only approve profiles after offline identity and professional credentials checks.</p>
        </div>
        <div className={card+' space-y-3'}>
          <h3 className="text-lg font-bold">Order disputes</h3>
          {moderatorDisputes.filter(d=>d.status==='OPEN').length===0 && <p className="text-sm text-slate-600">No open disputes.</p>}
          {moderatorDisputes.filter(d=>d.status==='OPEN').map(d=><div key={d.id} className="border-b border-slate-200 pb-4">
            <p className="text-sm font-semibold">Order {d.orderId} — {d.order.status}</p>
            <p className="my-2 whitespace-pre-wrap text-sm">{d.reason}</p>
            <div className="flex gap-2">
              <button className={button} disabled={busy} onClick={()=>void perform(()=>managedApi(`/freelance/admin/disputes/${d.id}/resolve`,{decision:'RESUME'}),'Order resumed')}>Resume work</button>
              <button className={outlined} disabled={busy} onClick={()=>void perform(()=>managedApi(`/freelance/admin/disputes/${d.id}/resolve`,{decision:'CANCEL'}),'Order cancelled')}>Cancel order</button>
            </div>
          </div>)}
          <p className="text-xs text-slate-500">Decisions change workflow status only; they do not trigger refunds or payments.</p>
        </div>
      </section>}
    </main>
  </div>;
}
