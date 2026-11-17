import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { managedApi } from '../services/managedApi';

type Scope = 'FREELANCE_ORDER' | 'MANAGED_ENGAGEMENT' | 'GLOBAL_JOB';
type Attachment = {id:string;filename:string;contentType:string;sizeBytes:number;createdAt:string};
type Capabilities={livePaymentsEnabled:boolean;sandboxConfigured:boolean;escrowEnabled:boolean;actualPayoutsEnabled:boolean;provider:string};
const apiBase = (import.meta.env.VITE_API_BASE_URL||'http://localhost:4000/api/v1').replace(/\/$/,'');
const fmt = (err:unknown)=>err instanceof Error?err.message:'Unexpected error';
const MAX_SIZE=2*1024*1024;

function AttachmentPanel({scope,resourceId}:{scope:Scope;resourceId:string}){
  const [documents,setDocuments]=useState<Attachment[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const reload=async()=>setDocuments(await managedApi<Attachment[]>(
    '/private-documents?scope='+encodeURIComponent(scope)+'&resourceId='+encodeURIComponent(resourceId)));
  useEffect(()=>{void reload().catch(e=>setError(fmt(e)));},[scope,resourceId]);
  async function send(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(!file)return;
    if(file.size<1||file.size>MAX_SIZE){setError('Maximum file size is 2 MiB');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const contentBase64=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
        reader.onerror=()=>reject(new Error('Unable to read file'));
        reader.readAsDataURL(file);
      });
      await managedApi('/private-documents',{scope,resourceId,filename:file.name,
        contentType:file.type,contentBase64});
      setFile(null);await reload();setNotice('Encrypted attachment stored.');
    }catch(err){setError(fmt(err));}finally{setBusy(false);}
  }
  async function download(doc:Attachment){
    setBusy(true);setError('');
    try{
      const token=await auth.currentUser?.getIdToken();
      if(!token)throw new Error('Sign in again');
      const response=await fetch(apiBase+'/private-documents/'+encodeURIComponent(doc.id)+'/download',{
        headers:{Authorization:'Bearer '+token}
      });
      if(!response.ok)throw new Error('Download failed: '+response.status);
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;anchor.download=doc.filename;
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){setError(fmt(err));}finally{setBusy(false);}
  }
  return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h4 className="font-semibold">Private project documents</h4>
    <p className="my-2 text-xs text-slate-600">Encrypted at rest. Files are accessible only to authorized project participants. PDF/JPEG/PNG, maximum 2 MiB.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
    <div className="space-y-2">{documents.map(doc=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-2">
      <span className="text-sm">{doc.filename} ({Math.round(doc.sizeBytes/1024)} KB)</span>
      <button type="button" disabled={busy} className="text-sm font-semibold text-blue-700" onClick={()=>void download(doc)}>Download</button>
    </div>)}</div>
    <form onSubmit={e=>void send(e)} className="mt-3 flex flex-wrap items-center gap-3">
      <input aria-label="Upload private project document" required type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        onChange={e=>setFile(e.target.files?.[0]||null)} className="max-w-full text-xs"/>
      <button disabled={busy||!file} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Secure upload</button>
    </form>
  </section>;
}

export function SecureDocuments({scope,resourceId}:{scope:Scope;resourceId:string}){
  return <AttachmentPanel scope={scope} resourceId={resourceId}/>;
}

export function SandboxCheckout({kind,resourceId}:{kind:Scope;resourceId:string}){
  const [caps,setCaps]=useState<Capabilities|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{managedApi<Capabilities>('/commerce/capabilities').then(setCaps).catch(()=>{});},[]);
  const start=async()=>{
    setBusy(true);setError('');
    try{
      const response=await managedApi<{url:string}>('/commerce/sandbox/checkout',{kind,resourceId});
      const url=new URL(response.url);
      if(url.protocol!=='https:'||url.hostname!=='checkout.flutterwave.com')throw new Error('Untrusted payment page');
      window.location.assign(url.toString());
    }catch(err){setError(fmt(err));setBusy(false);}
  };
  if(!caps?.sandboxConfigured)return null;
  return <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
    <p className="font-semibold">Sandbox checkout — test transactions only</p>
    <p className="my-2">No real money, escrow or payouts. This is for validating the payment workflow.</p>
    {error&&<p role="alert" className="mb-2 text-red-700">{error}</p>}
    <button disabled={busy} onClick={()=>void start()} className="rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
      Open Flutterwave test checkout
    </button>
  </div>;
}

export function SandboxPaymentReturn(){
  const [message,setMessage]=useState('Checking sandbox transaction…');
  const [error,setError]=useState('');
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const attempt=params.get('attempt'),id=params.get('transaction_id');
    if(!attempt||!id){setError('Incomplete checkout callback. No payment has been confirmed.');return;}
    managedApi('/commerce/sandbox/attempts/'+encodeURIComponent(attempt)+'/reconcile',{transactionId:id})
      .then(()=>setMessage('Test transaction verified with Flutterwave. No real funds have been transferred.'))
      .catch(e=>setError(fmt(e)));
  },[]);
  return <main className="mx-auto max-w-2xl space-y-4 px-5 py-16">
    <h1 className="text-2xl font-bold">Sandbox payment verification</h1>
    <p>{message}</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <a href="/freelance/workspace" className="text-blue-700 underline">Return to marketplace workspace</a>
  </main>;
}
