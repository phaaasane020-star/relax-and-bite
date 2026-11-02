// Back arrows ([data-back]) go to the previous page when it was one of ours.
export function bindBackButtons(): void {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-back]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    let fromUs = false;
    try {
      fromUs = !!document.referrer && new URL(document.referrer).origin === location.origin && document.referrer !== location.href;
    } catch {
      fromUs = false;
    }
    if (fromUs && history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });
}
