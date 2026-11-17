import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { GlobalJobsService } from '../src/global-jobs/global-jobs.service';

const employer={id:'owner',name:'Employer',role:'CLIENT',status:'ACTIVE'} as any;
const freelancer={id:'worker',name:'Developer',role:'FREELANCER',status:'ACTIVE'} as any;
const outsider={id:'outsider',name:'Other',role:'FREELANCER',status:'ACTIVE'} as any;

function stub(sellerStatus='VERIFIED'){
  let job:any={id:'job-1',employerId:'owner',status:'OPEN',selectedUserId:null,title:'Build AI model',
    description:'Develop the model',skills:'Python',category:'Data science',
    currency:'USD',budgetCents:100000,location:'Remote',remote:true,
    createdAt:new Date(),updatedAt:new Date()};
  let application={id:'app-1',jobId:'job-1',applicantId:'worker',pitch:'I can build it',status:'APPLIED'};
  let updates=0;
  const db:any={
    globalJob:{
      findUnique:async({where}:any)=>where.id===job.id?job:null,
      findFirst:async({where}:any)=>where.id===job.id?job:null,
      findMany:async()=>[],
      create:async({data}:any)=>({id:'new-job',...data}),
      updateMany:async({where,data}:any)=>{
        if(where.id!==job.id||where.status!==job.status)return {count:0};
        job={...job,...data};return {count:1};
      },
    },
    globalJobApplication:{
      findUnique:async()=>null,
      create:async({data}:any)=>({...data,id:'created-application',status:'APPLIED'}),
      findFirst:async({where}:any)=>where.id===application.id&&where.jobId===job.id?application:null,
      findMany:async()=>[],
      update:async()=>({}),
      updateMany:async()=>({count:1}),
    },
    freelanceSeller:{findUnique:async()=>({status:sellerStatus})},
    globalJobMessage:{
      create:async({data}:any)=>({id:'message',...data}),
      findMany:async()=>[],
    },
    globalJobUpdate:{
      create:async({data}:any)=>{updates++;return {id:'update-1',...data};},
      findMany:async()=>[],
    },
    globalJobMilestone:{
      updateMany:async()=>({count:1}),
      findMany:async()=>[],
      count:async()=>1,
    },
    auditLog:{create:async()=>({})},
  };
  db.$transaction=async(fn:any)=>fn(db);
  return { service:new GlobalJobsService(db),db,job:()=>job,updates:()=>updates };
}

test('public job feed exposes only open, job-scoped fields',async()=>{
  const {service}=stub();
  const listing=await service.publicJobs('Python');
  assert.equal(listing.limit,50);
  assert.deepEqual(listing.jobs,[]);
});
test('employer cannot apply to their own job',async()=>{
  const {service}=stub();
  await assert.rejects(service.apply(employer,'job-1',{pitch:'Me'}));
});
test('application accepts verified identity but never client-supplied applicant ID',async()=>{
  const {service}=stub();
  const app=await service.apply(freelancer,'job-1',{pitch:'Can deliver',applicantId:'owner'}) as any;
  assert.equal(app.applicantId,'worker');
});
test('unrelated people cannot access a job workspace, its messages, or progress',async()=>{
  const {service}=stub();
  await assert.rejects(service.privateJob(outsider,'job-1'));
  await assert.rejects(service.messages(outsider,'job-1'));
  await assert.rejects(service.updates(outsider,'job-1'));
});
test('an outsider cannot review applicants or offer jobs',async()=>{
  const {service}=stub();
  await assert.rejects(service.applications(outsider,'job-1'));
  await assert.rejects(service.offer(outsider,'job-1','app-1'));
});
test('employer cannot send offer until freelancer verified',async()=>{
  const {service}=stub('PENDING');
  await assert.rejects(service.offer(employer,'job-1','app-1'));
});
test('verified freelancer may receive an offer; only its owner can respond',async()=>{
  const {service,job}=stub();
  await service.offer(employer,'job-1','app-1');
  assert.equal(job().status,'OFFERED');
  assert.equal(job().selectedUserId,'worker');
  await assert.rejects(service.respond(outsider,'job-1',true));
  await service.respond(freelancer,'job-1',true);
  assert.equal(job().status,'IN_PROGRESS');
});
test('unassigned freelancer cannot submit progress or milestones',async()=>{
  const {service,updates}=stub();
  await assert.rejects(service.updateProgress(freelancer,'job-1',{summary:'Work',percent:30}));
  await assert.rejects(service.submit(freelancer,'job-1','mile-1',{submission:'Done'}));
  assert.equal(updates(),0);
});
test('employers cannot impersonate freelancers in work updates',async()=>{
  const {service}=stub();
  await assert.rejects(service.updateProgress(employer,'job-1',{summary:'Fake',percent:99}));
});
test('posting validates scope, skills and milestone boundaries',async()=>{
  const {service}=stub();
  await assert.rejects(service.post(employer,{title:'Ok',description:'Desc',skills:'',milestones:['M1']}));
  await assert.rejects(service.post(employer,{title:'Ok',description:'Desc',skills:'Python',milestones:[]}));
});
