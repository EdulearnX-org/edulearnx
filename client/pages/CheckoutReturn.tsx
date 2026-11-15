import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePortalAuth } from '@/lib/portalData';
import { readApiResponse } from '@/lib/api';
import Navbar from '@/components/Navbar';

type Application={id:string;status:'pending'|'approved'|'rejected';submission_state:string;course_title:string};
export default function CheckoutReturn() {
  const [params]=useSearchParams();const id=params.get('application_id');
  const {user,isLoading:authLoading}=usePortalAuth();
  const validId=Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const status=useQuery({queryKey:['application-status',user?.id,id],enabled:!!user && validId, retry:false,queryFn:async()=>{
    const response=await fetch(`/api/enrollment-requests/${encodeURIComponent(id!)}/status`,{signal:AbortSignal.timeout(30_000),cache:'no-store'});
    const payload=await readApiResponse(response);if(!response.ok || !payload.success) throw new Error(payload.error||'Unable to verify application status.');
    return payload.data as Application;
  }});
  let title='Application status',message='No application reference was provided. Payment and enrollment have not been verified.';
  if(authLoading) message='Restoring your session…';
  else if(validId && !user) message='Sign in to view your enrollment application.';
  else if(validId && status.isFetching) message='Checking your application…';
  else if(status.error) message=status.error.message;
  else if(status.data) {
    if(status.data.submission_state!=='complete') message='Your submission is incomplete. Return to checkout and submit your payment proof.';
    else if(status.data.status==='approved') {title='Enrollment approved';message=`Your application for ${status.data.course_title} has been approved. Open your student portal to access classes.`;}
    else if(status.data.status==='rejected') {title='Application rejected';message=`Your application for ${status.data.course_title} was rejected. Contact support if you need help.`;}
    else {title='Awaiting review';message=`Your payment proof for ${status.data.course_title} is awaiting admin review. Enrollment is granted after approval.`;}
  }
  return <div className="min-h-screen bg-slate-50"><Navbar/><main className="mx-auto max-w-2xl px-6 pb-16 pt-36"><div className="rounded-2xl border bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p role="status" className="my-6 text-slate-600">{message}</p><div className="flex flex-wrap gap-4"><Link className="font-semibold text-edu-purple" to={user?`/${user.role}`:'/signin'}>{user?'Open portal':'Sign in'}</Link><Link className="font-semibold text-edu-purple" to="/courses">Browse courses</Link>{status.data && <button type="button" disabled={status.isFetching} onClick={()=>void status.refetch()} className="font-semibold text-edu-purple">Refresh status</button>}</div></div></main></div>;
}
