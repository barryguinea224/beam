// BEAM Travel History PWA: only shell files are cached by /travel/sw.js.
// No trip data, Supabase request, signed URL or private photo is cached here.
(function (root) {
  "use strict";
  const PREFIX = "beam-travel-shell-";
  const PENDING_KEY = "beam.travel.auth.pending";
  function installed() {
    return Boolean(root.matchMedia?.("(display-mode: standalone)")?.matches ||
      root.navigator?.standalone === true);
  }
  function forgetLocalAuth(supabaseUrl) {
    // Supabase JS v2 stores the session using this project-specific key.
    // Never clear other applications' localStorage.
    try {
      const ref = new URL(supabaseUrl).hostname.split(".")[0];
      const key = "sb-" + ref + "-auth-token";
      for (const storage of [root.localStorage, root.sessionStorage]) {
        storage?.removeItem(key);
        storage?.removeItem(key + "-code-verifier");
      }
    } catch {}
    try { root.sessionStorage?.removeItem(PENDING_KEY); } catch {}
  }
  async function clearShellCaches() {
    // CacheStorage is origin-wide: only delete the BEAM Travel namespace.
    if (root.caches) {
      const names = await root.caches.keys();
      await Promise.all(names.filter(name => name.startsWith(PREFIX))
        .map(name => root.caches.delete(name)));
    }
    // The SW can be running concurrently. Send it the same purge request.
    const controller = root.navigator?.serviceWorker?.controller;
    if (controller && typeof MessageChannel !== "undefined") {
      try {
        await new Promise(resolve => {
          const channel = new MessageChannel();
          const timeout = setTimeout(resolve, 1600);
          channel.port1.onmessage = () => { clearTimeout(timeout); resolve(); };
          controller.postMessage({type:"BEAM_CLEAR_PUBLIC_SHELL"}, [channel.port2]);
        });
      } catch {}
      // Close the potential race with a cache opened before the message arrived.
      if (root.caches) {
        const names = await root.caches.keys();
        await Promise.all(names.filter(name => name.startsWith(PREFIX))
          .map(name => root.caches.delete(name)));
      }
    }
  }
  async function register() {
    if (!("serviceWorker" in root.navigator) ||
        root.location.pathname !== "/travel/" &&
        root.location.pathname !== "/travel/index.html") return null;
    try {
      return await root.navigator.serviceWorker.register("/travel/sw.js", {
        scope:"/travel/",updateViaCache:"none"
      });
    } catch {
      // A failed SW install must never interfere with the online application.
      return null;
    }
  }
  function emphasizeOtp() {
    if (!installed()) return;
    const loginButton = root.document.querySelector("#login button[type=submit], #login button");
    if (loginButton) loginButton.textContent = "Recevoir un code à 6 chiffres";
    const guidance = root.document.querySelector("#otpBox p.sub");
    if (guidance) guidance.textContent =
      "Saisissez ici le code à 6 chiffres reçu par e-mail. Le lien reçu peut ouvrir Chrome au lieu de cette application.";
  }
  const api=Object.freeze({installed,forgetLocalAuth,clearShellCaches,register,emphasizeOtp});
  root.BEAM_TRAVEL_PWA=api;
  root.addEventListener("load",()=>{emphasizeOtp();register()},{once:true});
})(window);
