// Runs before CDN/identity scripts. Hide every private view if disconnected.
(function(){
 if(!navigator.onLine)document.documentElement.classList.add("beamOffline");
 window.addEventListener("offline",()=>document.documentElement.classList.add("beamOffline"));
 window.addEventListener("online",()=>location.reload());
})();
