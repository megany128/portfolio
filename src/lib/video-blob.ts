/*
  Cloudflare Workers static assets answer Range requests with a plain 200 +
  full body instead of 206 Partial Content. Safari probes `Range: bytes=0-1`
  before playing a <video> and refuses to play (blank box) when the probe
  fails. Blob URLs skip the range probe entirely, so fetch each mp4 fully
  and swap the element's src to an object URL. On fetch failure the original
  src is left in place (Chrome plays it fine either way).
*/

const swapped = new WeakSet<HTMLVideoElement>();
let activeUrls: string[] = [];
let cleanupRegistered = false;

export function initVideoBlobs() {
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    document.addEventListener("astro:before-swap", () => {
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
      activeUrls = [];
    });
  }

  document.querySelectorAll<HTMLVideoElement>('video[src$=".mp4"]').forEach((video) => {
    if (swapped.has(video)) return;
    swapped.add(video);
    const src = video.getAttribute("src");
    if (!src) return;

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} fetching ${src}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        activeUrls.push(url);
        video.src = url;
        video.play().catch(() => {});
      })
      .catch(() => {
        swapped.delete(video);
      });
  });
}
