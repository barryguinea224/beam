/* Les outils du conseiller voyage — rendu au format de la page Acteurs */
(function () {
  "use strict";
  var D = window.RESSOURCES_VOYAGE;
  if (!D) return;
  var $ = function (id) { return document.getElementById(id); };
  var norm = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var cats = {}; D.categories.forEach(function (c) { cats[c.id] = c.nom; });

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") n.textContent = props[k];
      else if (k === "className") n.className = props[k];
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (k) { if (k) n.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return n;
  }
  function lien(l, nomRes) {
    return el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", "aria-label": l.label + " — " + nomRes + ", nouvelle fenêtre" },
      [l.label + " ", el("span", { "aria-hidden": "true", text: "↗" })]);
  }
  function copier(url) {
    var b = el("button", { type: "button", className: "outil-copier", text: "Copier le lien" });
    b.addEventListener("click", function () {
      var ok = function () { b.textContent = "Lien copié ✓"; setTimeout(function () { b.textContent = "Copier le lien"; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { prompt("Copiez le lien :", url); });
      else prompt("Copiez le lien :", url);
    });
    return b;
  }
  function ligne(t, v) { return v ? el("li", {}, [el("strong", { text: t + " : " }), v]) : null; }
  function depot(dp) {
    if (!dp) return null;
    return ligne("Dépôt", [dp.ville || dp.pays, dp.prestataire ? "— " + dp.prestataire : ""].filter(Boolean).join(" ") +
      (dp.particularites ? ". " + dp.particularites : ""));
  }
  function statut(s) { return el("span", { className: "outil-statut outil-statut--" + s, text: D.statuts[s] }); }

  function blocPays(p, nomRes) {
    var liens = el("div", { className: "outil-liens" }, p.liens.map(function (l) { return lien(l, p.nom); }));
    return el("details", { className: "outil-pays" }, [
      el("summary", {}, [el("span", { text: p.nom }), p.depot ? el("small", { text: p.depot.court || p.depot.ville || "" }) : null]),
      el("ul", {}, [p.essentiel ? el("li", { text: p.essentiel }) : null, depot(p.depot),
        p.statut !== "confirme" ? ligne("Statut", D.statuts[p.statut]) : null, ligne("Réserve", p.reserve)]),
      liens, p.liens[0] ? copier(p.liens[0].url) : null
    ]);
  }

  function carte(r) {
    var principal = r.liens[0];
    var top = el("div", { className: "actor-card-top" }, [
      el("span", { className: "actor-category", text: cats[r.categorie] }),
      r.pays ? el("span", { className: "actor-opportunity", text: r.pays.length + " pays" }) : (r.statut !== "confirme" ? statut(r.statut) : null)
    ]);
    var corps = [top, el("h3", { text: r.titre }), el("p", { text: r.utilite })];
    if (r.essentiel) corps.push(el("p", { className: "outil-essentiel", text: r.essentiel }));
    if (r.pays) {
      corps.push(el("div", { className: "outil-pays-liste" }, r.pays.map(function (p) { return blocPays(p, r.titre); })));
    }
    var details = el("details", { className: "outil-details" }, [
      el("summary", { text: "Plus de détails" }),
      el("ul", {}, [ligne("Organisme", r.nom), depot(r.depot), ligne("Source", r.source),
        ligne("Vérifié le", r.dateVerification), ligne("Statut", D.statuts[r.statut]), ligne("Réserve", r.reserve)]),
      r.liens.length > 1 ? el("div", { className: "outil-liens" }, r.liens.slice(1).map(function (l) { return lien(l, r.titre); })) : null,
      principal ? copier(principal.url) : null
    ]);
    corps.push(details);
    if (principal) {
      var a = lien(principal, r.titre); a.className = "outil-principal"; corps.push(a);
    }
    var txt = [r.titre, r.type, r.nom, r.utilite, r.essentiel, r.motsCles, cats[r.categorie],
      r.depot && r.depot.court, r.depot && r.depot.prestataire];
    (r.pays || []).forEach(function (p) { txt.push(p.nom, p.organisme, p.depot && p.depot.court, p.depot && p.depot.prestataire); });
    var c = el("article", { className: "actor-card outil-card", "data-category": r.categorie, id: "r-" + r.id }, corps);
    c._q = norm(txt.join(" "));
    return c;
  }

  var grid = $("actor-grid"), input = $("actor-search"), filtres = $("actor-filters");
  var cartes = D.ressources.map(carte);
  cartes.forEach(function (c) { grid.appendChild(c); });
  $("outil-stats").innerHTML = "<span><strong>" + D.ressources.length + "</strong> ressources</span><span><strong>" +
    D.categories.length + "</strong> catégories</span><span><strong>100 %</strong> liens officiels vérifiés</span>";

  var params = new URLSearchParams(location.search);
  var sel = params.get("categorie") || "all";
  if (sel !== "all" && !cats[sel]) sel = "all";
  input.value = params.get("q") || "";

  var boutons = [{ id: "all", nom: "Tout voir" }].concat(D.categories).map(function (c) {
    var b = el("button", { type: "button", className: "actor-filter", "data-filter": c.id, "aria-pressed": "false", text: c.nom });
    b.addEventListener("click", function () { sel = c.id; maj(true); });
    filtres.appendChild(b);
    return b;
  });

  function maj(ecrire) {
    var q = norm(input.value.trim()), n = 0;
    cartes.forEach(function (c) {
      var v = (sel === "all" || c.dataset.category === sel) && c._q.indexOf(q) !== -1;
      c.hidden = !v; if (v) n++;
    });
    boutons.forEach(function (b) { var on = b.dataset.filter === sel; b.classList.toggle("selected", on); b.setAttribute("aria-pressed", String(on)); });
    $("actor-count").textContent = n + " ressource" + (n === 1 ? "" : "s") + " affichée" + (n === 1 ? "" : "s");
    $("actor-empty").hidden = n !== 0;
    if (ecrire) {
      var p = new URLSearchParams();
      if (input.value.trim()) p.set("q", input.value.trim());
      if (sel !== "all") p.set("categorie", sel);
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : "") + location.hash);
    }
  }
  input.addEventListener("input", function () { maj(true); });
  maj(false);
  if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
})();
