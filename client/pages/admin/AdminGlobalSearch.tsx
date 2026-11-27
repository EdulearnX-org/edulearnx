import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, Users, BookOpen, ClipboardList, GraduationCap } from "lucide-react";

type Result = { title: string; detail: string; href: string; kind: string; icon: React.ReactNode };

export default function AdminGlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{users:any[];courses:any[];requests:any[];applications:any[]}>({users:[],courses:[],requests:[],applications:[]});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const endpoints = [
        ["/api/users", "users"],
        ["/api/courses", "courses"],
        ["/api/enrollment-requests", "requests"],
        ["/api/tutor-applications", "applications"],
      ] as const;
      const values = await Promise.all(endpoints.map(async ([url,key]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) return [key, []] as const;
          const payload = await response.json();
          return [key, payload.success && Array.isArray(payload.data) ? payload.data : []] as const;
        } catch { return [key, []] as const; }
      }));
      if (!active) return;
      setData(Object.fromEntries(values) as typeof data);
      setLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const found: Result[] = [];
    data.users.forEach((u) => {
      if ([u.full_name,u.email,u.role,String(u.id)].some((v) => String(v ?? "").toLowerCase().includes(term)))
        found.push({title:u.full_name || u.email,detail:`${u.email} · ${u.role}`,href:u.role==="teacher"?"/admin/teachers":u.role==="student"?"/admin/students":"/admin/settings",kind:"Account",icon:<Users className="h-4 w-4"/>});
    });
    data.courses.forEach((c) => {
      if ([c.title,c.instructor_name,c.category,String(c.id)].some((v) => String(v ?? "").toLowerCase().includes(term)))
        found.push({title:c.title,detail:`${c.instructor_name || "No instructor"} · Course`,href:"/admin/courses",kind:"Course",icon:<BookOpen className="h-4 w-4"/>});
    });
    data.requests.forEach((r) => {
      if ([r.student_name,r.student_email,r.course_title,String(r.id)].some((v) => String(v ?? "").toLowerCase().includes(term)))
        found.push({title:r.student_name || r.student_email || "Enrollment request",detail:`${r.course_title || "Course"} · ${r.status}`,href:"/admin/enrollment-requests",kind:"Enrollment",icon:<ClipboardList className="h-4 w-4"/>});
    });
    data.applications.forEach((a) => {
      if ([a.full_name,a.name,a.email,a.subject,String(a.id)].some((v) => String(v ?? "").toLowerCase().includes(term)))
        found.push({title:a.full_name || a.name || a.email || "Tutor application",detail:`${a.email || ""} · ${a.status}`,href:"/admin/tutor-applications",kind:"Tutor",icon:<GraduationCap className="h-4 w-4"/>});
    });
    return found.slice(0,12);
  }, [data,query]);

  return <div className="relative z-20 mb-5">
    <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/65 px-4 py-3 shadow-lg backdrop-blur-xl">
      <Search className="h-5 w-5 shrink-0 text-cyan-300"/>
      <input value={query} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);}} onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);setQuery("");}}} placeholder="Search people, courses, enrollments and tutor applications…" aria-label="Search the admin portal" className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-400"/>
      {query && <button type="button" onClick={()=>{setQuery("");setOpen(false);}} aria-label="Clear search" className="rounded-lg p-1 text-slate-300 hover:bg-white/10"><X className="h-4 w-4"/></button>}
      <span className="hidden rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-400 sm:block">GLOBAL SEARCH</span>
    </div>
    {open && query.trim() && <div className="absolute left-0 right-0 top-full mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
      {!loaded ? <p className="p-4 text-sm text-slate-400">Searching available admin records…</p> : results.length ? results.map((item,i)=><Link key={item.kind+item.title+i} to={item.href} onClick={()=>{setOpen(false);setQuery("");}} className="flex items-center gap-3 rounded-xl px-3 py-3 text-white transition hover:bg-white/10">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/10 text-cyan-200">{item.icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-slate-400">{item.detail}</span></span><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.kind}</span>
      </Link>) : <p className="p-4 text-sm text-slate-400">No matching records found.</p>}
    </div>}
    {open && query.trim() && <button type="button" aria-label="Close search results" onClick={()=>setOpen(false)} className="fixed inset-0 -z-10 cursor-default"/>}
  </div>;
}
