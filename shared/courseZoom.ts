export type CourseZoomLink = {
  course_id: number | string;
  zoom_link: string | null;
};

export const zoomLinkError = "Enter a valid HTTPS Zoom meeting link, such as https://zoom.us/j/123456789.";

export function normalizeZoomLink(value: unknown): string | null {
  if (value === null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string" || value.length > 2048) throw new Error(zoomLinkError);
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error(zoomLinkError); }
  const allowedHost = ["zoom.us", "zoom.com", "zoomgov.com"].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  if (url.protocol !== "https:" || !allowedHost || url.username || url.password || url.port) {
    throw new Error(zoomLinkError);
  }
  return url.href;
}
