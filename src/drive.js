export const ROOT = import.meta.env?.VITE_DRIVE_FOLDER_ID || '1F2MiaOXR-jJi976Sys5aOVcsUbtM_tTM';
export const FOLDER = 'application/vnd.google-apps.folder';
export const naturalSort = (files) => [...files].sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true,sensitivity:'base'}));
export const readable = f => f.mimeType?.startsWith('image/') || f.mimeType === 'application/pdf';
export async function driveRequest(token, path, params={}, signal) {
 const response = await fetch(`https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(params)}`, {headers:{Authorization:`Bearer ${token}`},signal});
 if (!response.ok) {
  if(response.status===401) throw new Error('Your Google session expired. Disconnect and connect again.');
  if(response.status===403) throw new Error('Google Drive denied access. Check that Drive API is enabled and you granted read-only access.');
  throw new Error(`Could not load this Drive item (${response.status}). Please try again.`);
 }
 return response;
}
export async function listFolder(token,id,signal) {
 let files=[], pageToken='';
 do {
  const response=await driveRequest(token,'files',{q:`'${id.replace(/'/g,"\\'")}' in parents and trashed = false`,fields:'nextPageToken,files(id,name,mimeType,modifiedTime)',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})},signal);
  const data=await response.json(); files.push(...data.files); pageToken=data.nextPageToken;
 } while(pageToken);
 return naturalSort(files);
}
// Only render image/PDF bytes. Never execute HTML stored in Drive.
export async function chapterFiles(token,id,signal) {
 const children=await listFolder(token,id,signal);
 const imageFolders=children.filter(f=>f.mimeType===FOLDER && /^images?$/i.test(f.name));
 const nested=await Promise.all(imageFolders.map(f=>listFolder(token,f.id,signal)));
 return naturalSort([...children,...nested.flat()].filter(readable));
}
