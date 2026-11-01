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

  // Native install is intentionally never advertised until the browser gives
  // us a real BeforeInstallPromptEvent; no fake install button or forced prompt.
  // <details> stays useful on iPhone, Samsung Internet, and unsupported browsers.
  let deferredInstall=null,installBusy=false,installDone=false,installNotice="";
  function installHelpText(ua) {
    const agent=String(ua||"");
    if (/iPhone|iPad|iPod/i.test(agent)) return "iPhone ou iPad : ouvrez ce carnet dans Safari. Touchez Partager, puis « Sur l’écran d’accueil ». Activez « Ouvrir comme app web » si l’option apparaît, puis touchez Ajouter. L’installation depuis cette page ne peut pas être lancée automatiquement.";
    if (/SamsungBrowser/i.test(agent)) return "Samsung Internet : touchez l’icône d’installation (+) si elle apparaît, ou ouvrez le menu ☰, puis « Ajouter la page à » > « Écran d’accueil ». Confirmez l’ajout ou l’installation lorsque le navigateur le propose.";
    if (/Android/i.test(agent)) return "Chrome sur Android : ouvrez le menu ⋮, puis « Installer l’application » ou « Ajouter à l’écran d’accueil » si cette option apparaît. Depuis WhatsApp ou un navigateur intégré, ouvrez d’abord la page directement dans Chrome.";
    if (/Macintosh/i.test(agent)) return "Sur Mac : dans Safari, ouvrez Fichier > « Ajouter au Dock », si proposé. Dans Chrome, utilisez l’option d’installation du menu si elle est disponible.";
    return "Sur ordinateur : dans Chrome ou Edge, ouvrez le menu et choisissez « Installer » lorsque cette option apparaît. Sinon, un raccourci peut simplement ouvrir la page dans le navigateur : ce n’est pas nécessairement une application installée.";
  }
  function installAreas(){
    return [...(root.document?.querySelectorAll?.("[data-beam-install-area]")||[])];
  }
  function renderInstallUi(){
    const ready=!installDone&&!installed(),offer=ready&&!installBusy&&Boolean(deferredInstall);
    for(const area of installAreas()){
      area.hidden=!ready;
      const button=area.querySelector("[data-beam-install-action]");
      const instructions=area.querySelector("[data-beam-install-steps]");
      const status=area.querySelector("[data-beam-install-status]");
      if(button){button.hidden=!offer;button.disabled=installBusy;}
      if(instructions)instructions.textContent=installHelpText(root.navigator?.userAgent);
      if(status)status.textContent=installNotice;
      if(!ready){
        const details=area.querySelector("[data-beam-install-help]");
        if(details)details.open=false;
      }
    }
  }
  function bindInstallUi(){
    for(const area of installAreas()){
      const button=area.querySelector("[data-beam-install-action]");
      if(!button||button.dataset.beamInstallBound==="1")continue;
      button.dataset.beamInstallBound="1";
      button.addEventListener("click",async()=>{
        // The browser requires this prompt call to begin in a genuine click.
        const event=deferredInstall;
        if(!event||installBusy||installDone||installed()){renderInstallUi();return;}
        deferredInstall=null;installBusy=true;installNotice="";
        renderInstallUi();
        let accepted=false;
        try{
          const answer=event.prompt();
          const result=await (answer&&typeof answer.then==="function"?answer:event.userChoice);
          accepted=result?.outcome==="accepted";
          installNotice=accepted?
            "Demande d’installation acceptée. Vérifiez l’icône BTH sur votre écran d’accueil.":
            "Installation non confirmée. Vous pouvez utiliser le menu de votre navigateur.";
        }catch{
          installNotice="Installation native indisponible. Consultez les étapes de votre navigateur.";
        }finally{
          installBusy=false;
          if(!accepted){
            const details=area.querySelector("[data-beam-install-help]");
            if(details)details.open=true;
          }
          renderInstallUi();
        }
      });
    }
    renderInstallUi();
  }
  root.addEventListener("beforeinstallprompt",event=>{
    if(installed()||installDone||typeof event?.prompt!=="function")return;
    event.preventDefault?.();
    deferredInstall=event;
    installNotice="";
    bindInstallUi();
  });
  root.addEventListener("appinstalled",()=>{
    installDone=true;deferredInstall=null;installBusy=false;
    installNotice="";
    renderInstallUi();
  });
  root.addEventListener("pageshow",()=>{bindInstallUi();renderInstallUi();});
  root.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change",renderInstallUi);
  bindInstallUi();

  const api=Object.freeze({installed,forgetLocalAuth,clearShellCaches,register,emphasizeOtp,installHelpText,bindInstallUi});
  root.BEAM_TRAVEL_PWA=api;
  root.addEventListener("load",()=>{emphasizeOtp();register()},{once:true});
})(window);
