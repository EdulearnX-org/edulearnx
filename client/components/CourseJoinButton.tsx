import { Video } from "lucide-react";
import { useCourseZoomLinks } from "@/hooks/useCourseZoomLinks";
import { normalizeZoomLink } from "@shared/courseZoom";

export default function CourseJoinButton({ courseId }: { courseId: number | string }) {
  const { data, isPending, error, refetch } = useCourseZoomLinks();
  const savedLink = data?.find((link) => String(link.course_id) === String(courseId))?.zoom_link;
  let link: string | null = null;
  try { link = normalizeZoomLink(savedLink ?? null); } catch { /* Do not render an unsafe legacy URL. */ }
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700";
  if (error) return <button type="button" onClick={() => void refetch()} className={`${buttonClass} mt-3`}>Retry class link</button>;
  return (
    <div className="mt-3 space-y-1">
      {link ? <a href={link} target="_blank" rel="noopener noreferrer" className={buttonClass}><Video className="h-4 w-4" /> Join class</a> : <button type="button" disabled className={`${buttonClass} cursor-not-allowed opacity-50`}><Video className="h-4 w-4" />{isPending ? "Loading class link..." : "Join class"}</button>}
      <p className="text-xs text-slate-500 dark:text-slate-400">{link ? "Opens Zoom in a new tab." : isPending ? "Checking your course..." : "Your teacher has not added a Zoom link yet."}</p>
    </div>
  );
}
