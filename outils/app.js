/* Les outils du conseiller voyage — logique de la page (JavaScript sans dépendance) */
(function () {
  "use strict";

  var DATA_URL = "data/ressources.json";
  var etat = { recherche: "", categorie: "toutes", statut: "tous" };
  var donnees = null;

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

  function texteRecherche(r) {
    var parts = [r.nom, r.utilite, r.source, r.reserve, r.id, r.motsCles];
    r.liens.forEach(function (l) { parts.push(l.label, l.url); });
    if (r.depot) parts.push(r.depot.pays, r.depot.ville, r.depot.prestataire, r.depot.particularites);
    var cat = donnees.categories.filter(function (c) { return c.id === r.categorie; })[0];
    if (cat) parts.push(cat.nom);
    parts.push(donnees.statuts[r.statut]);
    return normaliser(parts.join(" "));
  }

  function correspond(r) {
    if (etat.categorie !== "toutes" && r.categorie !== etat.categorie) return false;
    if (etat.statut !== "tous" && r.statut !== etat.statut) return false;
    if (!etat.recherche) return true;
    var mots = normaliser(etat.recherche).split(" ");
    return mots.every(function (m) { return r._index.indexOf(m) !== -1; });
  }

  /* ---------- Rendu ---------- */

  function cellule(label, className, enfants) {
    var td = el("td", { className: className }, enfants);
    if (label) td.setAttribute("data-label", label);
    return td;
  }

  function blocDepot(d) {
    var dl = el("dl");
    [["Pays", d.pays], ["Ville", d.ville], ["Prestataire", d.prestataire], ["Particularités", d.particularites]]
      .forEach(function (p) {
        if (!p[1]) return;
        dl.appendChild(el("dt", { text: p[0] }));
        dl.appendChild(el("dd", { text: p[1] }));
      });
    return el("div", { className: "depot" }, [el("p", { className: "depot__titre", text: "Lieu de dépôt du dossier" }), dl]);
  }

  function blocLiens(r) {
    if (r.statut === "introuvable" || !r.liens.length) {
      return el("p", { className: "sans-lien", text: "Aucune source officielle trouvée." });
    }
    var ul = el("ul", { className: "liens" });
    r.liens.forEach(function (l) {
      var a = el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.label });
      a.setAttribute("aria-label", l.label + " — " + r.nom + " (nouvel onglet)");
      var btn = el("button", { type: "button", className: "copier", "data-url": l.url, text: "Copier" });
      btn.setAttribute("aria-label", "Copier l'adresse : " + l.label + " — " + r.nom);
      ul.appendChild(el("li", { className: "lien" }, [a, btn]));
    });
    return ul;
  }

  function ligne(r) {
    var ressource = [el("span", { className: "nom", text: r.nom }), el("span", { className: "ref", text: "Réf. " + r.id })];
    var utilite = [el("p", { className: "utilite", text: r.utilite })];
    if (r.depot) utilite.push(blocDepot(r.depot));

    var dates = el("p", { className: "dates" }, [
      el("span", { text: "Publication : " + (r.datePublication || "non indiquée") }),
      el("span", { text: "Vérification : " + r.dateVerification })
    ]);

    var verif = [el("span", { className: "statut statut--" + r.statut, text: donnees.statuts[r.statut] })];
    if (r.reserve) verif.push(el("p", { className: "reserve" }, [el("strong", { text: "Réserve : " }), r.reserve]));

    return el("tr", null, [
      cellule("Ressource", "cell-ressource", ressource),
      cellule("Utilité", "", utilite),
      cellule("Lien officiel", "", [blocLiens(r)]),
      cellule("Source et date", "", [el("p", { className: "source", text: r.source }), dates]),
      cellule("Vérification", "", verif)
    ]);
  }

  function tableau(liste, titreId) {
    var cols = ["Ressource", "Utilité", "Lien officiel", "Source et date", "Vérification"];
    var classes = ["col-ressource", "col-utilite", "col-lien", "col-source", "col-verif"];
    var thead = el("thead", null, [el("tr", null, cols.map(function (c, i) {
      return el("th", { scope: "col", className: classes[i], text: c });
    }))]);
    var tbody = el("tbody", null, liste.map(ligne));
    var t = el("table", { className: "tableau" }, [thead, tbody]);
    t.setAttribute("aria-labelledby", titreId);
    return t;
  }

  function afficher() {
    var zone = $("resultats");
    zone.innerHTML = "";
    var total = 0;

    donnees.categories.forEach(function (c) {
      if (etat.categorie !== "toutes" && etat.categorie !== c.id) return;
      var liste = donnees.ressources.filter(function (r) { return r.categorie === c.id && correspond(r); });
      if (!liste.length) return;
      total += liste.length;
      var titreId = "cat-" + c.id;
      zone.appendChild(el("section", { className: "categorie", "aria-labelledby": titreId }, [
        el("div", { className: "categorie__tete" }, [
          el("h2", { id: titreId, text: c.nom }),
          el("span", { className: "categorie__nombre", text: liste.length + (liste.length > 1 ? " ressources" : " ressource") })
        ]),
        el("p", { className: "categorie__desc", text: c.description }),
        tableau(liste, titreId)
      ]));
    });

    var n = donnees.ressources.length;
    $("compteur").innerHTML = "";
    $("compteur").appendChild(el("strong", { text: String(total) }));
    $("compteur").appendChild(document.createTextNode(
      (total > 1 ? " ressources affichées" : " ressource affichée") + " sur " + n));
    $("aucun").hidden = total !== 0;
    majPuces();
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
    fc.appendChild(puce("categorie", "toutes", "Toutes", donnees.ressources.length));
    donnees.categories.forEach(function (c) {
      var nb = donnees.ressources.filter(function (r) { return r.categorie === c.id; }).length;
      fc.appendChild(puce("categorie", c.id, c.nom, nb));
    });
    var fs = $("filtre-statuts");
    fs.appendChild(puce("statut", "tous", "Tous", donnees.ressources.length));
    Object.keys(donnees.statuts).forEach(function (s) {
      var nb = donnees.ressources.filter(function (r) { return r.statut === s; }).length;
      fs.appendChild(puce("statut", s, donnees.statuts[s], nb));
    });

    document.querySelectorAll(".puce").forEach(function (b) {
      b.addEventListener("click", function () {
        etat[b.getAttribute("data-groupe")] = b.getAttribute("data-valeur");
        afficher();
      });
    });
  }

  function majPuces() {
    document.querySelectorAll(".puce").forEach(function (b) {
      var actif = etat[b.getAttribute("data-groupe")] === b.getAttribute("data-valeur");
      b.setAttribute("aria-pressed", actif ? "true" : "false");
    });
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
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        function () { toast("Adresse copiée"); },
        function () { toast(copierSecours(url) ? "Adresse copiée" : "Copie impossible : appui long sur le lien"); }
      );
    } else {
      toast(copierSecours(url) ? "Adresse copiée" : "Copie impossible : appui long sur le lien");
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
    $("site-note-pied").textContent = site.notePied;
    $("chiffre-total").textContent = String(donnees.ressources.length);
    $("chiffre-date").textContent = site.derniereVerification;
    $("pied-date").textContent = site.derniereVerification;
    $("pied-editeur").textContent = site.editeur;
    var retour = $("lien-retour");
    retour.textContent = "← " + site.retourLabel;
    retour.href = site.retourUrl;
  }

  function demarrer(json) {
    donnees = json;
    donnees.ressources.forEach(function (r) { r.liens = r.liens || []; r._index = texteRecherche(r); });
    remplirTextes(donnees.site);
    construireFiltres();

    var champ = $("recherche");
    champ.addEventListener("input", function () { etat.recherche = champ.value; afficher(); });

    $("reinitialiser").addEventListener("click", function () {
      etat = { recherche: "", categorie: "toutes", statut: "tous" };
      champ.value = "";
      afficher();
      champ.focus();
    });

    $("resultats").addEventListener("click", function (e) {
      var b = e.target.closest(".copier");
      if (b) copier(b.getAttribute("data-url"));
    });

    afficher();
  }

  function echec() {
    $("erreur").hidden = false;
    $("compteur").textContent = "";
  }

  // 1) Données servies par le site (data/ressources.json) ; 2) copie locale data/ressources.js si la page est ouverte hors serveur.
  if (window.fetch && location.protocol !== "file:") {
    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(demarrer)
      .catch(function () { window.RESSOURCES_VOYAGE ? demarrer(window.RESSOURCES_VOYAGE) : echec(); });
  } else if (window.RESSOURCES_VOYAGE) {
    demarrer(window.RESSOURCES_VOYAGE);
  } else {
    echec();
  }
})();
