export const ROOT =
  import.meta.env?.VITE_DRIVE_FOLDER_ID || "1F2MiaOXR-jJi976Sys5aOVcsUbtM_tTM";
export const FOLDER = "application/vnd.google-apps.folder";
export const naturalSort = (files) =>
  [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
export const readable = (f) => Boolean(f.mimeType && f.mimeType !== FOLDER);
export async function driveRequest(token, path, params = {}, signal) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(params)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) {
    if (response.status === 401)
      throw new Error(
        "Your Google session expired. Disconnect and connect again.",
      );
    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      const error = body.error || {};
      const reasons = [
        ...(error.errors || []).map((item) => item.reason),
        ...(error.details || []).map((item) => item.reason),
      ];
      if (
        reasons.some((reason) =>
          ["accessNotConfigured", "SERVICE_DISABLED"].includes(reason),
        )
      ) {
        throw new Error(
          "Google Drive API is disabled in your OAuth project. Enable it at https://console.cloud.google.com/apis/library/drive.googleapis.com?project=548264816971, wait a few minutes, then Refresh library.",
        );
      }
      if (
        reasons.some((reason) =>
          [
            "insufficientPermissions",
            "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
          ].includes(reason),
        )
      ) {
        throw new Error(
          "Google Drive read permission is missing. Disconnect, reconnect, and allow read-only access to Drive.",
        );
      }
      throw new Error(
        error.message ||
          "Google Drive denied access (403). Check that your signed-in account can open this folder.",
      );
    }
    throw new Error(
      `Could not load this Drive item (${response.status}). Please try again.`,
    );
  }
  return response;
}
export async function listFolder(token, id, signal) {
  let files = [],
    pageToken = "";
  do {
    const response = await driveRequest(
      token,
      "files",
      {
        q: `'${id.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields:
          "nextPageToken,files(id,name,mimeType,modifiedTime,imageMediaMetadata(width,height))",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        ...(pageToken ? { pageToken } : {}),
      },
      signal,
    );
    const data = await response.json();
    files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return naturalSort(files);
}
// Only render image/PDF bytes. Never execute HTML stored in Drive.
export async function chapterFiles(token, id, signal) {
  const children = await listFolder(token, id, signal);
  const imageFolders = children.filter(
    (f) => f.mimeType === FOLDER && /^images?$/i.test(f.name),
  );
  const nested = await Promise.all(
    imageFolders.map((f) => listFolder(token, f.id, signal)),
  );
  const content = [...children, ...nested.flat()].filter(readable);
  // Generated HTML indexes duplicate the actual manga pages.
  return naturalSort(
    content.filter(
      (f) =>
        !(
          content.some((p) => p.mimeType.startsWith("image/")) &&
          /^(index|default)\.html?$/i.test(f.name)
        ),
    ),
  );
}
