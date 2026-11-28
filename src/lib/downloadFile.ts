// Abeer, 2026-11-28: "all the docs which we click on download directly it
// should start downloading without preview" — window.open(signedUrl) left
// the browser free to decide (Chrome/Edge open a PDF inline in a new tab
// rather than saving it). An invisible <a download> click forces a save
// dialog/direct download instead, and paired with the signed URL's own
// `download=` query param (see getDocumentDownloadUrlAction) the file also
// lands under its real name rather than the storage object's random id.
export function triggerFileDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Same end result, for a PDF the browser already generated in memory as base64. */
export function triggerBase64Download(base64: string, fileName: string, mimeType = "application/pdf"): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  triggerFileDownload(url, fileName);
  URL.revokeObjectURL(url);
}
