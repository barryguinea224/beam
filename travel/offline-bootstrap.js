// Runs before CDN/identity scripts. The public shell can hydrate an allowlisted
// IndexedDB snapshot, but no authenticated online view appears until that check.
(function(){
 if(!navigator.onLine)document.documentElement.classList.add("beamOffline");
 window.addEventListener("offline",()=>document.documentElement.classList.add("beamOffline"));
 window.addEventListener("online",()=>location.reload());
})();
