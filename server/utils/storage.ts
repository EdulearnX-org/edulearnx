import { HttpError } from './errors.js';
export function storageConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Private file storage is unavailable.');
  return { url: url.replace(/\/+$/, ''), key };
}
export function objectPath(path: string) { return path.split('/').map(encodeURIComponent).join('/'); }
export async function storageFetch(path: string, init: RequestInit = {}) {
  const {url,key}=storageConfig();
  const response=await fetch(`${url}/storage/v1${path}`, {...init, signal: AbortSignal.timeout(20_000), headers:{apikey:key,Authorization:`Bearer ${key}`,...init.headers}});
  if (!response.ok) throw new HttpError(response.status===404 ? 400 : 502, response.status===404 ? 'Upload not found. Upload the file again.' : 'Private file storage request failed. Please retry.');
  return response;
}
export async function signedDownload(bucket: string,path: string) {
  const response=await storageFetch(`/object/sign/${bucket}/${objectPath(path)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:120})});
  const data=await response.json() as {signedURL:string};
  return `${storageConfig().url}/storage/v1${data.signedURL}`;
}
export async function deleteObject(bucket: string,path: string) {
  await storageFetch(`/object/${bucket}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});
}
export const maxUploadBytes=5*1024*1024;
export const fileTypes=['image/jpeg','image/png','image/webp','application/pdf'] as const;
export function validateFile(data: Buffer,type: string) {
  if (!data.length || data.length>maxUploadBytes) throw new HttpError(400,'Files must contain 1 byte to 5 MB.');
  const valid=(type==='image/jpeg' && data[0]===255 && data[1]===216 && data[2]===255)
    || (type==='image/png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (type==='image/webp' && data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP')
    || (type==='application/pdf' && data.toString('ascii',0,5)==='%PDF-');
  if (!valid) throw new HttpError(400,'File content does not match its declared type.');
}
export async function readObject(bucket: string,path: string,size: number,type: string) {
  const response=await storageFetch(`/object/authenticated/${bucket}/${objectPath(path)}`);
  const reader=response.body?.getReader();
  if (!reader) throw new HttpError(400,'Uploaded file is empty.');
  const chunks:Uint8Array[]=[]; let length=0;
  try {
    for (;;) { const {done,value}=await reader.read(); if(done) break; length+=value.length;
      if(length>maxUploadBytes || length>size) { await reader.cancel(); throw new HttpError(400,'Uploaded file exceeds the declared size.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  if(length!==size) throw new HttpError(400,'Uploaded file size does not match.');
  validateFile(Buffer.concat(chunks),type);
}
