import { readApiResponse } from './api';
export type UploadReference={upload_id:string;upload_token:string};
export async function uploadPrivateFile(file:File,purpose:'receipt'|'certificate',onProgress?:(progress:{loaded:number;total:number})=>void):Promise<UploadReference> {
  const allowed=purpose==='receipt'?['image/jpeg','image/png','image/webp','application/pdf']:['image/jpeg','image/png','application/pdf'];
  if(!allowed.includes(file.type) || file.size<1 || file.size>5*1024*1024) throw new Error('Choose a supported file between 1 byte and 5 MB.');
  const response=await fetch('/api/uploads',{method:'POST',signal:AbortSignal.timeout(30_000),headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose,content_type:file.type,byte_size:file.size})});
  const payload=await readApiResponse(response);
  if(!response.ok || !payload.success) throw new Error(payload.error||'Unable to start upload.');
  await new Promise<void>((resolve,reject)=>{
    const request=new XMLHttpRequest();request.open('PUT',payload.data.upload_url);request.timeout=120_000;
    request.setRequestHeader('Content-Type',file.type);request.setRequestHeader('x-upsert','false');
    request.upload.onprogress=e=>onProgress?.({loaded:e.loaded,total:e.lengthComputable?e.total:file.size});
    request.onerror=()=>reject(new Error('File upload failed. Check your connection and retry.'));
    request.ontimeout=()=>reject(new Error('File upload timed out. Please retry.'));
    request.onabort=()=>reject(new Error('File upload was cancelled.'));
    request.onload=()=>request.status>=200 && request.status<300?resolve():reject(new Error('File storage rejected the upload. Please retry.'));
    request.send(file);
  });
  return {upload_id:payload.data.upload_id,upload_token:payload.data.upload_token};
}
