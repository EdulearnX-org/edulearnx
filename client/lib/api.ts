export async function readApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  const normalizedText = text.trim().toLowerCase();
  const isHtmlDocument =
    contentType.includes("text/html") ||
    normalizedText.startsWith("<!doctype html") ||
    normalizedText.startsWith("<html");

  if (isHtmlDocument) {
    return {
      success: false,
      apiFallback: true,
      error:
        "The data service returned the app page instead of JSON. Please check the API connection and try again.",
    };
  }

  return {
    success: false,
    error:
      text.trim() ||
      `Request failed with status ${response.status || "unknown"}.`,
  };
}
