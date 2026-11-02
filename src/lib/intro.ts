// The intro when the app opens: the red R&B mark pops in, a bite is taken
// out of its corner, the name and slogan rise in, then it fades into the app.
// Pure CSS, nothing to download, so it shows instantly.
// The phone's start-up screen is the same plain white (android styles.xml),
// so the app goes straight from tapping the icon into this.
// Once per app launch, in the Android app and the iPhone web app (not the website). Tap to skip.

const DONE_KEY = 'rb_intro_done';
/** How long the intro shows before lifting away (ms) */
const HOLD = 2700;
/** The fade into the app (ms), matches intro-out in the CSS */
const FADE = 650;

/**
 * Runs in <head>: decides whether this page opens with the intro (html.intro).
 * Must run after the script that adds html.in-app.
 * Add ?intro=1 to any address to preview it in a normal browser.
 */
export const INTRO_GATE = `(function(){var d=document.documentElement;if(/[?&]intro=1/.test(location.search)){d.classList.add('intro');return}if(!d.classList.contains('in-app')&&!d.classList.contains('pwa'))return;try{if(sessionStorage.getItem('${DONE_KEY}'))return;var n=performance.getEntriesByType('navigation')[0];if(n&&n.type!=='navigate')return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return}catch(e){return}d.classList.add('intro')})();`;

export function bindIntro(): void {
  const root = document.documentElement;
  const box = document.getElementById('intro');
  if (!box || !root.classList.contains('intro')) {
    box?.remove();
    return;
  }

  try {
    if (!/[?&]intro=1/.test(location.search)) sessionStorage.setItem(DONE_KEY, '1');
  } catch {
    /* plays again next time, which is fine */
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    root.classList.add('intro-leaving');
    window.setTimeout(() => {
      root.classList.remove('intro', 'intro-leaving');
      box.remove();
      window.dispatchEvent(new Event('rb:intro-done'));
    }, FADE);
  };

  box.addEventListener('click', finish);
  window.setTimeout(finish, HOLD);
}
