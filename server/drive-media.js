import { setTimeout as delay } from "node:timers/promises";
export async function fetchDriveMedia(
  url,
  options,
  fetcher = fetch,
  wait = delay,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(url, options);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2)
      return response;
    await response.body?.cancel();
    await wait(300 * 2 ** attempt, undefined, { signal: options.signal });
  }
}
