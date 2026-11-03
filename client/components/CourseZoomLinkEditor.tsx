import { useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Video } from "lucide-react";
import { useCourseZoomLinks } from "@/hooks/useCourseZoomLinks";
import { readApiResponse } from "@/lib/api";
import { useCurrentUser } from "@/lib/user";
import { normalizeZoomLink, type CourseZoomLink } from "@shared/courseZoom";

export default function CourseZoomLinkEditor({ courseId }: { courseId: number | string }) {
  const id = useId();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const { data, isPending, error: loadError, refetch } = useCourseZoomLinks();
  const savedLink = data?.find((link) => String(link.course_id) === String(courseId))?.zoom_link ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setError(""); setMessage("");
    try {
      const zoomLink = normalizeZoomLink(draft ?? savedLink);
      setIsSaving(true);
      const response = await fetch(`/api/courses/${courseId}/zoom-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoom_link: zoomLink }),
      });
      const payload = await readApiResponse(response);
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save the Zoom link.");
      const queryKey = ["course-zoom-links", user?.id, user?.role];
      queryClient.setQueryData<CourseZoomLink[]>(queryKey, (current) =>
        current?.some((link) => String(link.course_id) === String(courseId))
          ? current.map((link) => String(link.course_id) === String(courseId) ? payload.data : link)
          : [...(current ?? []), payload.data],
      );
      setDraft(null);
      setMessage(zoomLink ? "Zoom link saved. Enrolled students can now join." : "Zoom link removed.");
      void queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save the Zoom link.");
    } finally { setIsSaving(false); }
  };

  return (
    <form onSubmit={save} className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Video className="h-4 w-4" /> Zoom meeting link</label>
      {loadError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">Unable to load the saved link. <button type="button" onClick={() => void refetch()} className="font-bold underline">Try again</button></p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} type="url" maxLength={2048} value={draft ?? savedLink} disabled={isPending || Boolean(loadError) || isSaving} onChange={(event) => { setDraft(event.target.value); setError(""); setMessage(""); }} placeholder={isPending ? "Loading Zoom link..." : "https://zoom.us/j/..."} aria-describedby={`${id}-help`} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        <button type="submit" disabled={isPending || Boolean(loadError) || isSaving || draft === null || draft === savedLink} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save Zoom link"}</button>
      </div>
      <p id={`${id}-help`} className="text-xs text-slate-600 dark:text-slate-400">Paste the full Zoom invitation link, including its passcode. Clear the field and save to remove it.</p>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      {savedLink && <a href={savedLink} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-semibold text-blue-700 underline dark:text-blue-300">Open Zoom meeting</a>}
    </form>
  );
}
