/* Les outils du conseiller voyage — logique de la page (JavaScript sans dépendance) */
(function () {
  "use strict";

  var DATA_URL = "data/ressources.json";
  var CLE_SCROLL = "outils-scroll";
  var etat = { recherche: "", categorie: "toutes", statut: "tous" };
  var donnees = null;
  var cartesVisibles = [];   // ordre d'affichage courant
  var observateur = null;
  var enVue = new Set();

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") n.textContent = attrs[k];
        else if (k === "className") n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    (enfants || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  // Recherche insensible aux accents et à la casse
  function normaliser(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
  }

  function nomCategorie(id) {
    var c = donnees.categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.nom : "";
  }

  function texteRecherche(r) {
    var parts = [r.titre, r.type, r.essentiel, r.nom, r.utilite, r.source, r.reserve, r.id, r.motsCles,
      nomCategorie(r.categorie), donnees.statuts[r.statut]];
    r.liens.forEach(function (l) { parts.push(l.label, l.url); });
    if (r.depot) parts.push(r.depot.pays, r.depot.ville, r.depot.prestataire, r.depot.particularites, r.depot.court);
    return normaliser(parts.join(" "));
  }

  function correspond(r) {
    if (etat.categorie !== "toutes" && r.categorie !== etat.categorie) return false;
    if (etat.statut !== "tous" && r.statut !== etat.statut) return false;
    if (!etat.recherche.trim()) return true;
    return normaliser(etat.recherche).split(" ").every(function (m) { return r._index.indexOf(m) !== -1; });
  }

  /* ---------- Fiche à deux niveaux ---------- */

  function lieuDepot(d) {
    if (d.court) return d.court;
    return [d.ville, d.pays].filter(function (x) { return x && x !== "—"; }).join(", ");
  }

  function boutonCopier(url, libelle) {
    var b = el("button", { type: "button", className: "copier", "data-url": url, text: "Copier" });
    b.setAttribute("aria-label", "Copier l'adresse : " + libelle);
    return b;
  }

  function lienExterne(l, r, className) {
    var a = el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", className: className || "", text: l.label });
    a.setAttribute("aria-label", l.label + " — " + r.titre + " (nouvel onglet)");
    return a;
  }

  function ligneDetail(terme, valeur) {
    if (!valeur) return null;
    return [el("dt", { text: terme }), el("dd", null, typeof valeur === "string" ? [valeur] : [valeur])];
  }

  function fiche(r, position) {
    var idDet = "det-" + r.id;
    var sansLien = r.statut === "introuvable" || !r.liens.length;

    // Niveau principal
    var marques = el("div", { className: "fiche__marques" }, [
      el("span", { className: "statut statut--" + r.statut, text: donnees.statuts[r.statut] }),
      r.reserve ? el("span", { className: "marque-reserve", text: "Réserve" }) : null
    ]);
    var tete = el("div", { className: "fiche__tete" }, [
      el("div", { className: "fiche__ligne-titre" }, [
        el("h3", { className: "fiche__titre" + (r.categorie === "ambassades" ? " fiche__titre--pays" : ""), text: r.titre }),
        marques
      ]),
      el("p", { className: "fiche__type", text: r.type })
    ]);

    var essentiel = el("dl", { className: "fiche__essentiel" });
    if (r.depot) {
      essentiel.appendChild(el("div", null, [el("dt", { text: "Dépôt" }), el("dd", { text: lieuDepot(r.depot) })]));
      essentiel.appendChild(el("div", null, [el("dt", { text: "Prestataire" }), el("dd", { text: r.depot.prestataire })]));
    }
    var texteEss = r.essentiel || (!r.depot && r.categorie !== "compagnies" ? r.utilite : "");
    var pEss = texteEss ? el("p", { className: "fiche__info", text: texteEss }) : null;

    var actions = el("div", { className: "fiche__bas" });
    if (sansLien) {
      actions.appendChild(el("span", { className: "sans-lien", text: "Aucune source officielle trouvée" }));
    } else {
      r.liens.forEach(function (l, i) {
        if (r.categorie !== "compagnies" && i > 0) return; // les liens secondaires sont dans le détail
        var court = r.categorie === "compagnies" && /bagages/i.test(l.label) ? { label: "Bagages", url: l.url } : l;
        actions.appendChild(lienExterne(court, r, "fiche__lien"));
      });
    }

    var bouton = el("button", { type: "button", className: "fiche__plus", "aria-expanded": "false", "aria-controls": idDet, text: "Plus de détails" });
    actions.insertBefore(bouton, actions.firstChild);

    // Niveau secondaire
    var dl = el("dl", { className: "fiche__detail-liste" });
    var lignes = [
      ligneDetail("Nom officiel", r.nom),
      ligneDetail("Utilité", r.utilite)
    ];
    if (r.depot) {
      lignes.push(ligneDetail("Pays de dépôt", r.depot.pays), ligneDetail("Ville", r.depot.ville),
        ligneDetail("Prestataire", r.depot.prestataire), ligneDetail("Particularités", r.depot.particularites));
    }
    if (r.reserve) lignes.push(ligneDetail("Réserve", el("strong", { className: "reserve", text: r.reserve })));
    if (!sansLien) {
      var ul = el("ul", { className: "liens" });
      r.liens.forEach(function (l) {
        ul.appendChild(el("li", null, [
          lienExterne(l, r), el("span", { className: "url", text: l.url }), boutonCopier(l.url, l.label + " — " + r.titre)
        ]));
      });
      lignes.push(ligneDetail(r.liens.length > 1 ? "Liens exacts" : "Lien exact", ul));
    }
    lignes.push(ligneDetail("Source", r.source), ligneDetail("Publication", r.datePublication || "non indiquée"),
      ligneDetail("Vérification", r.dateVerification), ligneDetail("Statut", donnees.statuts[r.statut] +
        (r.statut === "confirme" ? " (source officielle ; procédure à revérifier au moment du dossier)" : "")),
      ligneDetail("Référence", r.id));
    lignes.forEach(function (p) { if (p) { dl.appendChild(p[0]); dl.appendChild(p[1]); } });
    var detail = el("div", { className: "fiche__detail", id: idDet }, [dl]);
    detail.hidden = true;

    var art = el("article", { className: "fiche", id: "fiche-" + r.id, "data-position": String(position), "data-categorie": r.categorie },
      [tete, r.depot ? essentiel : null, pEss, actions, detail]);
    art.setAttribute("aria-label", r.titre + " — " + r.type);
    return art;
  }

  function ordreDansCategorie(c, liste) {
    if (c.id !== "ambassades") return liste;
    return liste.slice().sort(function (a, b) { return a.titre.localeCompare(b.titre, "fr"); });
  }

  /* ---------- Rendu ---------- */

  function afficher() {
    var zone = $("resultats");
    zone.innerHTML = "";
    cartesVisibles = [];
    var groupes = [];

    donnees.categories.forEach(function (c) {
      if (etat.categorie !== "toutes" && etat.categorie !== c.id) return;
      var liste = ordreDansCategorie(c, donnees.ressources.filter(function (r) { return r.categorie === c.id && correspond(r); }));
      if (liste.length) groupes.push({ c: c, liste: liste });
    });

    var pos = 0;
    groupes.forEach(function (g) {
      var titreId = "cat-" + g.c.id;
      var section = el("section", { className: "categorie", id: "section-" + g.c.id, "aria-labelledby": titreId }, [
        el("div", { className: "categorie__tete" }, [
          el("h2", { id: titreId, text: g.c.nom }),
          el("span", { className: "categorie__nombre", text: g.liste.length + (g.liste.length > 1 ? " ressources" : " ressource") })
        ]),
        el("p", { className: "categorie__desc", text: g.c.description })
      ]);
      g.liste.forEach(function (r) {
        pos += 1;
        var f = fiche(r, pos);
        cartesVisibles.push(f);
        section.appendChild(f);
      });
      zone.appendChild(section);
    });

    var total = cartesVisibles.length;
    var cpt = $("compteur");
    cpt.innerHTML = "";
    cpt.appendChild(el("strong", { text: String(total) }));
    if (etat.recherche.trim()) {
      cpt.appendChild(document.createTextNode(total > 1 ? " résultats" : " résultat"));
    } else {
      cpt.appendChild(document.createTextNode((total > 1 ? " ressources affichées" : " ressource affichée") + " sur " + donnees.ressources.length));
    }
    $("aucun").hidden = total !== 0;
    majPuces();
    majMenuRepere(groupes);
    observer();
    memoriserEtat();
  }

  /* ---------- Barre de repère ---------- */

  function majMenuRepere(groupes) {
    var s = $("repere-aller");
    s.innerHTML = "";
    s.appendChild(el("option", { value: "", text: "Catégories" }));
    groupes.forEach(function (g) {
      s.appendChild(el("option", { value: g.c.id, text: g.c.nom + " (" + g.liste.length + ")" }));
    });
    $("repere").hidden = cartesVisibles.length === 0;
  }

  function majRepere(carte) {
    if (!carte) carte = cartesVisibles[0];
    if (!carte) return;
    $("repere-cat").textContent = nomCategorie(carte.getAttribute("data-categorie"));
    $("repere-pos").textContent = carte.getAttribute("data-position") + " sur " + cartesVisibles.length;
  }

  function hauteurRepere() {
    var r = $("repere");
    return r && !r.hidden ? r.offsetHeight : 0;
  }

  function observer() {
    if (observateur) observateur.disconnect();
    enVue = new Set();
    majRepere(null);
    if (!("IntersectionObserver" in window)) return;
    var haut = hauteurRepere() + 8;
    observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) { if (e.isIntersecting) enVue.add(e.target); else enVue.delete(e.target); });
      var courante = null;
      enVue.forEach(function (c) {
        if (!courante || +c.getAttribute("data-position") < +courante.getAttribute("data-position")) courante = c;
      });
      if (courante) majRepere(courante);
      finDePage();
    }, { rootMargin: "-" + haut + "px 0px -70% 0px", threshold: 0 });
    cartesVisibles.forEach(function (c) { observateur.observe(c); });
  }

  // En bas de page, la dernière fiche ne peut pas atteindre le haut : on l'affiche comme position courante.
  function finDePage() {
    if (cartesVisibles.length && window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 4) {
      majRepere(cartesVisibles[cartesVisibles.length - 1]);
    }
  }

  function allerA(elm) {
    var y = elm.getBoundingClientRect().top + window.pageYOffset - hauteurRepere() - 8;
    window.scrollTo(0, Math.max(0, y));
  }

  /* ---------- Filtres ---------- */

  function puce(groupe, valeur, libelle, nombre) {
    var b = el("button", { type: "button", className: "puce", "data-groupe": groupe, "data-valeur": valeur }, [
      libelle, el("span", { className: "puce__nombre", text: String(nombre) })
    ]);
    b.setAttribute("aria-pressed", "false");
    return b;
  }

  function construireFiltres() {
    var fc = $("filtre-categories");
    fc.appendChild(ligneRubrique("toutes", "Toutes les ressources", donnees.ressources.length));
    donnees.categories.forEach(function (c) {
      var nb = donnees.ressources.filter(function (r) { return r.categorie === c.id; }).length;
      fc.appendChild(ligneRubrique(c.id, c.nom, nb));
    });
    var fs = $("filtre-statuts");
    fs.appendChild(puce("statut", "tous", "Tous", donnees.ressources.length));
    Object.keys(donnees.statuts).forEach(function (s) {
      var nb = donnees.ressources.filter(function (r) { return r.statut === s; }).length;
      fs.appendChild(puce("statut", s, donnees.statuts[s], nb));
    });
    document.querySelectorAll("[data-groupe]").forEach(function (b) {
      b.addEventListener("click", function () {
        etat[b.getAttribute("data-groupe")] = b.getAttribute("data-valeur");
        afficher();
      });
    });
    var rb = $("rubrique-bouton");
    rb.addEventListener("click", function () {
      var ouvert = rb.getAttribute("aria-expanded") === "true";
      rb.setAttribute("aria-expanded", ouvert ? "false" : "true");
      fc.hidden = ouvert;
    });
    document.querySelector('a[href="#rubriques"]').addEventListener("click", function () {
      rb.setAttribute("aria-expanded", "true");
      fc.hidden = false;
    });
  }

  function ligneRubrique(valeur, libelle, nombre) {
    var b = el("button", { type: "button", className: "rubrique__ligne", "data-groupe": "categorie", "data-valeur": valeur }, [
      el("span", { className: "rubrique__nom", text: libelle }),
      el("span", { className: "rubrique__nombre", text: String(nombre) })
    ]);
    b.setAttribute("aria-pressed", "false");
    return b;
  }

  function majPuces() {
    document.querySelectorAll("[data-groupe]").forEach(function (b) {
      b.setAttribute("aria-pressed", etat[b.getAttribute("data-groupe")] === b.getAttribute("data-valeur") ? "true" : "false");
    });
  }

  /* ---------- Conservation de l'état (adresse + position) ---------- */

  function memoriserEtat() {
    var p = new URLSearchParams();
    if (etat.recherche.trim()) p.set("q", etat.recherche.trim());
    if (etat.categorie !== "toutes") p.set("categorie", etat.categorie);
    if (etat.statut !== "tous") p.set("statut", etat.statut);
    var qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* ignoré */ }
  }

  function lireEtat() {
    var p = new URLSearchParams(location.search);
    etat.recherche = p.get("q") || "";
    var c = p.get("categorie");
    if (c && donnees.categories.some(function (x) { return x.id === c; })) etat.categorie = c;
    var s = p.get("statut");
    if (s && donnees.statuts[s]) etat.statut = s;
  }

  function sauverScroll() {
    try { sessionStorage.setItem(CLE_SCROLL, JSON.stringify({ q: location.search, y: window.pageYOffset })); } catch (e) { /* ignoré */ }
  }

  function restaurerScroll() {
    try {
      var v = JSON.parse(sessionStorage.getItem(CLE_SCROLL) || "null");
      if (v && v.q === location.search && v.y > 0) window.scrollTo(0, v.y);
    } catch (e) { /* ignoré */ }
  }

  /* ---------- Copie d'adresse ---------- */

  var minuteur = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function copierSecours(texte) {
    var ta = el("textarea");
    ta.value = texte;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copier(url) {
    var echecMsg = "Copie impossible : appui long sur le lien";
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        function () { toast("Adresse copiée"); },
        function () { toast(copierSecours(url) ? "Adresse copiée" : echecMsg); });
    } else {
      toast(copierSecours(url) ? "Adresse copiée" : echecMsg);
    }
  }

  /* ---------- Initialisation ---------- */

  function remplirTextes(site) {
    document.title = site.titre + " — " + site.mention;
    $("site-titre").textContent = site.titre;
    $("site-mention").textContent = site.mention;
    $("site-sous-titre").textContent = site.sousTitre;
    $("site-introduction").textContent = site.introduction;
    $("site-avertissement").textContent = site.avertissement;
    $("site-note-statut").textContent = site.noteStatut || "";
    $("site-note-pied").textContent = site.notePied;
    $("chiffre-total").textContent = String(donnees.ressources.length);
    $("chiffre-date").textContent = site.derniereVerification;
    $("pied-date").textContent = site.derniereVerification;
    $("pied-editeur").textContent = site.editeur;
    var retour = $("lien-retour");
    retour.textContent = site.retourLabel;
    retour.href = site.retourUrl;
  }

  function demarrer(json) {
    donnees = json;
    donnees.ressources.forEach(function (r) {
      r.liens = r.liens || [];
      r.titre = r.titre || r.nom;
      r.type = r.type || "";
      r._index = texteRecherche(r);
    });
    remplirTextes(donnees.site);
    construireFiltres();
    lireEtat();

    var champ = $("recherche");
    champ.value = etat.recherche;
    champ.addEventListener("input", function () { etat.recherche = champ.value; afficher(); });

    $("reinitialiser").addEventListener("click", function () {
      etat = { recherche: "", categorie: "toutes", statut: "tous" };
      champ.value = "";
      afficher();
      champ.focus();
    });

    $("resultats").addEventListener("click", function (e) {
      var c = e.target.closest(".copier");
      if (c) { copier(c.getAttribute("data-url")); return; }
      var b = e.target.closest(".fiche__plus");
      if (b) {
        var det = $(b.getAttribute("aria-controls"));
        var ouvrir = b.getAttribute("aria-expanded") !== "true";
        det.hidden = !ouvrir;
        b.setAttribute("aria-expanded", ouvrir ? "true" : "false");
        b.textContent = ouvrir ? "Réduire" : "Plus de détails";
        if (!ouvrir) {
          var f = b.closest(".fiche");
          if (f.getBoundingClientRect().top < hauteurRepere()) allerA(f);
        }
      }
    });

    $("repere-aller").addEventListener("change", function (e) {
      var v = e.target.value;
      e.target.value = "";
      var s = v && $("section-" + v);
      if (s) allerA(s);
    });
    $("repere-haut").addEventListener("click", function () {
      window.scrollTo(0, 0);
      champ.focus({ preventScroll: true });
    });

    var attente = false;
    window.addEventListener("scroll", function () {
      if (attente) return;
      attente = true;
      requestAnimationFrame(function () { attente = false; finDePage(); });
    }, { passive: true });
    window.addEventListener("pagehide", sauverScroll);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") sauverScroll(); });

    afficher();
    restaurerScroll();
  }

  function echec() {
    $("erreur").hidden = false;
    $("compteur").textContent = "";
  }

  // 1) Données servies par le site (data/ressources.json) ; 2) copie locale data/ressources.js hors serveur.
  if (window.fetch && location.protocol !== "file:") {
    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(demarrer)
      .catch(function () { if (window.RESSOURCES_VOYAGE) demarrer(window.RESSOURCES_VOYAGE); else echec(); });
  } else if (window.RESSOURCES_VOYAGE) {
    demarrer(window.RESSOURCES_VOYAGE);
  } else {
    echec();
  }
})();
