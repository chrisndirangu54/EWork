import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { managedApi } from '../services/managedApi';
import { SecureDocuments } from '../components/CommerceSecure';

type Milestone = {id:string;title:string;status:string;submission?:string|null;feedback?:string|null};
type Job = {id:string;title:string;description:string;category:string;skills:string;currency:string;
  budgetCents?:number|null;status:string;remote:boolean;location:string;employerId?:string;
  selectedUserId?:string|null;milestones?:Milestone[];sourceRef?:string|null};
type Application={id:string;jobId:string;applicantId:string;pitch:string;status:string;bidCents?:number|null;
  job?:{id:string;title:string;status:string;currency:string;budgetCents?:number|null}};
type Workspace={userId:string;sellerStatus:string;posted:Job[];assigned:Job[];applications:Application[];
  paymentsEnabled:boolean;settlementEnabled:boolean};
type ChatMessage={id:string;authorId:string;body:string;createdAt:string};
type WorkUpdate={id:string;authorId:string;summary:string;percent:number;createdAt:string};
const cls='rounded-xl border border-slate-300 px-3 py-2.5 bg-white w-full focus:border-blue-600 focus:outline-none';
const action='rounded-xl bg-blue-700 px-4 py-2.5 font-semibold text-sm text-white hover:bg-blue-800 disabled:opacity-50';
const secondary='rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-sm hover:bg-slate-50 disabled:opacity-50';
const panel='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4';
const badge='inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700';
function errMsg(error:unknown){return error instanceof Error?error.message:'Request failed';}
function format(amount?:number|null,currency='USD'){
  return amount == null?'Budget by agreement':new Intl.NumberFormat('en-US',
    {style:'currency',currency}).format(amount/100);
}
function Heading(){
  const { user }=useAuth();
  return <header className="border-b border-slate-200 bg-white px-6 py-5">
    <nav aria-label="Marketplace" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
      <Link to="/services" className="text-xl font-black">Tekn<span className="text-blue-700">Tandao</span> <span className="text-sm font-normal text-slate-500">Global Jobs</span></Link>
      <div className="flex gap-5 text-sm font-semibold">
        <Link to="/global-jobs">Jobs</Link><Link to="/freelance">Freelancer services</Link>
        <Link to="/managed">Managed outsourcing</Link>
        <Link to={user?'/global-jobs':'/login'}>{user?'My workspace':'Sign in'}</Link>
      </div>
    </nav>
  </header>;
}
function WorkCard({job,mine,refresh,onError,onSuccess}:{job:Job;mine:Workspace;
  refresh:()=>Promise<void>;onError:(s:string)=>void;onSuccess:(s:string)=>void}){
  const isEmployer=job.employerId===mine.userId;
  const isWorker=job.selectedUserId===mine.userId;
  const [applications,setApplications]=useState<Application[]|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]|null>(null);
  const [updates,setUpdates]=useState<WorkUpdate[]|null>(null);
  const [text,setText]=useState('');
  const [progress,setProgress]=useState('');
  const [percent,setPercent]=useState('25');
  const [busy,setBusy]=useState(false);
  const run=async(path:string,payload:Record<string,unknown>,msg:string)=>{
    setBusy(true);onError('');
    try{
      await managedApi('/global-jobs/'+job.id+path,payload);
      await refresh();onSuccess(msg);
      if(messages) await showMessages();
      if(updates) await showUpdates();
    }catch(e){onError(errMsg(e));}finally{setBusy(false);}
  };
  const showMessages=async()=>{
    try{setMessages(await managedApi<ChatMessage[]>('/global-jobs/'+job.id+'/messages'));}
    catch(e){onError(errMsg(e));}
  };
  const showUpdates=async()=>{
    try{setUpdates(await managedApi<WorkUpdate[]>('/global-jobs/'+job.id+'/updates'));}
    catch(e){onError(errMsg(e));}
  };
  return <article className={panel} key={job.id}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-xl font-bold">{job.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{format(job.budgetCents,job.currency)} · {job.location}</p></div>
      <span className={badge}>{job.status}</span>
    </div>
    <p className="whitespace-pre-wrap text-sm text-slate-700">{job.description}</p>
    {isEmployer&&job.status==='OPEN'&&<div className="flex flex-wrap gap-2">
      <button className={secondary} disabled={busy} onClick={()=>void managedApi<Application[]>(
        '/global-jobs/'+job.id+'/applications').then(setApplications).catch(e=>onError(errMsg(e)))}>
        Review applications
      </button>
      <button className={secondary} disabled={busy} onClick={()=>void run('/close',{},'Job closed')}>Close job</button>
    </div>}
    {applications?.map(app=><div key={app.id} className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-semibold">{app.status} · {format(app.bidCents,job.currency)}</div>
      <p className="my-2 whitespace-pre-wrap text-sm">{app.pitch}</p>
      {app.status==='APPLIED'&&job.status==='OPEN'&&<button className={action} disabled={busy}
        onClick={()=>void run('/offer',{applicationId:app.id},'Offer sent to verified freelancer')}>
        Offer this freelancer the job
      </button>}
    </div>)}
    {isWorker&&job.status==='OFFERED'&&<div className="flex flex-wrap gap-2">
      <button className={action} disabled={busy} onClick={()=>void run('/offer/respond',{accept:true},'Assignment accepted')}>Accept assignment</button>
      <button className={secondary} disabled={busy} onClick={()=>void run('/offer/respond',{accept:false},'Assignment declined')}>Decline</button>
    </div>}
    {job.status==='IN_PROGRESS'&&job.milestones?.map(m=><div className="rounded-xl border border-slate-200 p-4" key={m.id}>
      <div className="flex items-center justify-between"><strong>{m.title}</strong><span className={badge}>{m.status}</span></div>
      {m.submission&&<p className="mt-2 whitespace-pre-wrap text-sm">{m.submission}</p>}
      {m.feedback&&<p className="mt-2 text-sm text-amber-700">Requested changes: {m.feedback}</p>}
      {isWorker&&['OPEN','CHANGES_REQUESTED'].includes(m.status)&&
        <button className={action+' mt-3'} disabled={busy} onClick={()=>{
          const submission=window.prompt('Describe the completed deliverable (add files below):');
          if(submission?.trim())void run('/milestones/'+m.id+'/submit',{submission},'Milestone submitted');
        }}>Submit milestone</button>}
      {isEmployer&&m.status==='SUBMITTED'&&<div className="mt-3 flex flex-wrap gap-2">
        <button className={action} disabled={busy} onClick={()=>void run('/milestones/'+m.id+'/review',{approved:true},'Milestone accepted')}>Approve</button>
        <button className={secondary} disabled={busy} onClick={()=>{
          const feedback=window.prompt('Describe required revisions:');
          if(feedback?.trim())void run('/milestones/'+m.id+'/review',{approved:false,feedback},'Changes requested');
        }}>Request revisions</button>
      </div>}
    </div>)}
    {(isEmployer||isWorker)&&['IN_PROGRESS','COMPLETED'].includes(job.status)&&<>
      {isWorker&&job.status==='IN_PROGRESS'&&<form className="space-y-2" onSubmit={e=>{
        e.preventDefault();
        void run('/updates',{summary:progress,percent:Number(percent)},'Progress update recorded');
        setProgress('');
      }}>
        <h4 className="font-semibold">Send progress update</h4>
        <textarea className={cls} required maxLength={3000} rows={2} value={progress}
          onChange={e=>setProgress(e.target.value)}/>
        <div className="flex gap-3">
          <label className="text-sm">Completion estimate (%)
            <input className={cls} type="number" min="0" max="100" value={percent}
              onChange={e=>setPercent(e.target.value)}/></label>
          <button className={action} disabled={busy}>Record update</button>
        </div>
      </form>}
      <div><button className={secondary} onClick={()=>void showUpdates()}>View work history</button>
        {updates?.map(u=><p key={u.id} className="mt-2 text-sm">{u.percent}% — {u.summary}</p>)}</div>
      <div><button className={secondary} onClick={()=>void showMessages()}>View project messages</button>
        {messages&&<div className="mt-2 space-y-2">
          {messages.map(x=><p key={x.id} className="rounded-lg bg-slate-50 p-3 text-sm">{x.body}</p>)}
          {job.status==='IN_PROGRESS'&&<form className="flex gap-2" onSubmit={e=>{
            e.preventDefault();void run('/messages',{text},'Message sent');setText('');
          }}><input className={cls} required maxLength={3000} aria-label="Project message"
             value={text} onChange={e=>setText(e.target.value)}/><button className={action} disabled={busy}>Send</button></form>}
        </div>}
      </div>
      <SecureDocuments scope="GLOBAL_JOB" resourceId={job.id}/>
    </>}
    <p className="text-xs text-slate-500">All work is recorded in the shared marketplace API. Payments and contract signing are not enabled by this workflow.</p>
  </article>;
}
export function GlobalJobsPage(){
  const {user}=useAuth();
  const [jobs,setJobs]=useState<Job[]>([]);
  const [mine,setMine]=useState<Workspace|null>(null);
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [skills,setSkills]=useState('');
  const [budget,setBudget]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const [pub,priv]=await Promise.all([
      managedApi<{jobs:Job[]}>('/global-jobs'+(query?'?q='+encodeURIComponent(query):'')),
      user?managedApi<Workspace>('/global-jobs/workspace'):Promise.resolve(null),
    ]);
    setJobs(pub.jobs);setMine(priv);
  },[query,user]);
  useEffect(()=>{void load().catch(e=>setError(errMsg(e)));},[load]);
  async function perform(fn:()=>Promise<unknown>,success:string){
    setBusy(true);setError('');setNotice('');
    try{await fn();await load();setNotice(success);}catch(e){setError(errMsg(e));}finally{setBusy(false);}
  }
  const posted=mine?.posted||[],assigned=mine?.assigned||[];
  const applications=mine?.applications||[];
  return <div className="min-h-screen bg-slate-50 text-slate-900"><Heading/>
    <main className="mx-auto max-w-7xl space-y-8 px-5 py-12">
      <section><span className="text-sm font-semibold uppercase tracking-widest text-blue-700">TeknTandao global technology opportunities</span>
        <h1 className="mt-3 text-4xl font-black">Find jobs. Apply. Deliver in your workspace.</h1>
        <p className="mt-3 max-w-3xl text-slate-600">International clients can publish scopes; verified freelancers can be offered work and handle milestones, messages, progress and files from EWork or TeknTandao Workspace.</p>
      </section>
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-700">{notice}</p>}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Job offers and status changes are platform records, not legally executed agreements. No real payment collection, escrow or payout is enabled here.
      </div>
      <form className="flex max-w-xl gap-2" onSubmit={e=>{e.preventDefault();setQuery(search.trim());}}>
        <input className={cls} aria-label="Find global jobs" placeholder="Find data, AI, engineering jobs"
          maxLength={80} value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className={action}>Search</button>
      </form>
      <section className="space-y-4"><h2 className="text-2xl font-bold">Open global jobs</h2>
        {!jobs.length&&<p className="text-slate-500">No open jobs match your search yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">{jobs.map(j=><article key={j.id} className={panel}>
          <h3 className="text-xl font-bold">{j.title}</h3>
          <p className="text-sm text-slate-600">{j.category} · {j.location} · {format(j.budgetCents,j.currency)}</p>
          <p className="line-clamp-4 whitespace-pre-wrap text-sm">{j.description}</p>
          <p className="text-xs text-slate-500">Required skills: {j.skills}</p>
          {user? <button className={action} disabled={busy} onClick={()=>{
            const pitch=window.prompt('Why are you a good fit? Include your intended delivery approach:');
            if(pitch?.trim())void perform(()=>managedApi('/global-jobs/'+j.id+'/applications',{pitch}), 'Application submitted');
          }}>Apply for this job</button> : <Link to="/login" className="font-semibold text-blue-700">Sign in to apply</Link>}
        </article>)}</div>
      </section>
      {user&&<section className="grid gap-6 lg:grid-cols-2">
        <form className={panel} onSubmit={e=>{e.preventDefault();void perform(()=>managedApi('/global-jobs',{
          title,description,skills,category:'Software and technology',budgetCents:budget?Math.round(Number(budget)*100):null,
          currency:'USD',location:'Remote',remote:true}), 'Job published');}}>
          <h2 className="text-xl font-bold">Post an international job</h2>
          <label className="block text-sm font-semibold">Job title<input className={cls+' mt-1'} required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
          <label className="block text-sm font-semibold">Scope and deliverables<textarea className={cls+' mt-1'} required maxLength={6000} rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label>
          <label className="block text-sm font-semibold">Required skills<input className={cls+' mt-1'} required maxLength={500} value={skills} onChange={e=>setSkills(e.target.value)}/></label>
          <label className="block text-sm font-semibold">Indicative budget (USD)<input className={cls+' mt-1'} type="number" min="1" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
          <button className={action} disabled={busy}>Publish job</button>
        </form>
        <section className={panel}><h2 className="text-xl font-bold">My applications</h2>
          {applications.length===0&&<p className="text-slate-500">No applications yet.</p>}
          {applications.map(app=><p className="rounded-xl bg-slate-50 p-3 text-sm" key={app.id}>
            <strong>{app.job?.title||app.jobId}</strong> · {app.status}</p>)}
          <p className="text-sm text-slate-500">Freelancer verification: <strong>{mine?.sellerStatus}</strong>.
            You can apply before verification; the employer can offer an assignment only to a verified seller.</p>
          {mine?.sellerStatus==='NOT_APPLIED'&&<Link className="font-semibold text-blue-700" to="/freelance/workspace">Apply to become a verified freelancer →</Link>}
        </section>
      </section>}
      {user&&<section className="space-y-4"><h2 className="text-2xl font-bold">My assigned jobs</h2>
        {assigned.length===0&&<p className="text-slate-500">No assignments yet.</p>}
        {mine&&assigned.map(job=><WorkCard key={job.id} job={job} mine={mine} refresh={load} onError={setError} onSuccess={setNotice}/>)}
      </section>}
      {user&&<section className="space-y-4"><h2 className="text-2xl font-bold">Jobs I posted</h2>
        {posted.length===0&&<p className="text-slate-500">No posted jobs yet.</p>}
        {mine&&posted.map(job=><WorkCard key={job.id} job={job} mine={mine} refresh={load} onError={setError} onSuccess={setNotice}/>)}
      </section>}
    </main>
  </div>;
}
