// First-launch flow on phones: sign in (or skip) -> allow location -> home.
// Remembered on this device so it only shows once.

export const ONBOARDED_KEY = 'rb_onboarded_v1';

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* storage unavailable */
  }
  document.cookie = `rb_onboarded=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Home page gate, inlined in <head> so the home page never flashes first. */
export const ONBOARDING_GATE = `(function(){try{
if(document.cookie.indexOf('rb_onboarded=1')>-1||localStorage.getItem('${ONBOARDED_KEY}'))return;
var phone=window.matchMedia('(max-width: 767px)').matches;
var app=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(phone||app)location.replace('/welcome');
}catch(e){}})();`;
