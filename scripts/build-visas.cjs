"use strict";
/**
 * BEAM public visa guide, fully static. No browser JavaScript, tracking or APIs.
 * Local preview: node scripts/build-visas.cjs --preview
 * Strict CI check: node scripts/build-visas.cjs --check (all JSON must validate).
 * Production: node scripts/build-visas.cjs --production (exclude bad/demo,
 * never block BTH because of guide content).
 * Netlify CONTEXT=production always uses the resilient production build.
 */
const fs = require("node:fs");
const path = require("node:path");
// Reuse BTH’s local ISO 3166-1 alpha-2 catalogue (249 real country/territory codes).
const ISO_COUNTRIES = require("../travel/countries.js");

const MARKER = "EXEMPLE — NON VÉRIFIÉ";
const DISCLAIMER = "Informations indicatives, vérifiées à la date indiquée. Seule l'ambassade décide. BEAM n'est pas affilié aux ambassades ni aux centres de dépôt.";
const ALLOWED_STATUSES = ["obligatoire", "selon_le_cas"];
const DAY_MS = 86400000;

function fail(where, message) { throw new Error(where + " : " + message); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function shape(value, where, names) {
  if (!isRecord(value)) fail(where, "objet obligatoire");
  for (const name of names) if (!Object.hasOwn(value, name)) fail(where + "." + name, "champ obligatoire manquant");
  for (const name of Object.keys(value)) if (!names.includes(name)) fail(where + "." + name, "champ inconnu");
}
function requiredText(value, where) {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value)
    fail(where, "texte non vide obligatoire, sans espaces superflus");
  if (value.length > 1300) fail(where, "texte trop long");
  return value;
}
function parseDate(value, where, today) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(where, "date obligatoire au format AAAA-MM-JJ");
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail(where, "date calendaire invalide");
  if (value > today) fail(where, "date future interdite");
  return value;
}
function https(value, where) {
  if (typeof value !== "string" || !/^https:\/\//.test(value)) fail(where, "URL officielle HTTPS requise");
  let url;
  try { url = new URL(value); } catch { fail(where, "URL invalide"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || /\s/.test(value))
    fail(where, "URL HTTPS invalide ou avec identifiants");
  return value;
}
function todayUTC(now = new Date()) { return now.toISOString().slice(0, 10); }
function isStale(date, today) {
  return (Date.parse(today + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / DAY_MS > 90;
}
function needsReview(entry, today) {
  return isStale(entry.verifie_le, today) ||
    entry.types_visa.some(v=>isStale(v.frais.verifie_le, today) ||
      isStale(v.delai_indicatif.verifie_le, today));
}
function modeFor(args = process.argv.slice(2), env = process.env) {
  for (const a of args) if (!["--preview","--production","--check"].includes(a))
    fail("options", "option inconnue " + a);
  if (new Set(args).size > 1) fail("options", "modes contradictoires");
  if (env.CONTEXT === "production") return "production";
  if (args.includes("--check")) return "check";
  return args.includes("--production") ? "production" : "preview";
}
function containsExample(entry) {
  return isRecord(entry) &&
    (entry.statut === "exemple" ||
      JSON.stringify(entry).includes(MARKER));
}
function validateEntry(entry, slug, {mode = "preview", today = todayUTC()} = {}) {
  const at = "visas/data/" + slug + ".json";
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) fail(at, "nom de fichier dangereux");
  shape(entry, at, ["destination", "code_pays", "drapeau", "statut", "verifie_le", "types_visa"]);
  requiredText(entry.destination, at + ".destination");
  if (typeof entry.code_pays !== "string" || !/^[A-Z]{2}$/.test(entry.code_pays) ||
      !ISO_COUNTRIES.valid(entry.code_pays))
    fail(at + ".code_pays", "code ISO 3166-1 alpha-2 valide obligatoire (2 lettres majuscules)");
  requiredText(entry.drapeau, at + ".drapeau");
  if (!["exemple", "publie"].includes(entry.statut)) fail(at + ".statut", "valeur attendue : exemple ou publie");
  parseDate(entry.verifie_le, at + ".verifie_le", today);
  if (!Array.isArray(entry.types_visa) || entry.types_visa.length < 1) fail(at + ".types_visa", "au moins un type obligatoire");
  const demo = entry.statut === "exemple";
  // Placeholder rows are valid *examples* during preview/check. A supposedly
  // published fiche with leftover placeholder text is an editorial error.
  if (!demo && containsExample(entry))
    fail(at, "marqueur EXEMPLE résiduel dans une fiche marquée publie");
  for (const [i, visa] of entry.types_visa.entries()) {
    const where = at + ".types_visa[" + i + "]";
    shape(visa, where, ["type", "autorite_competente", "lieu_depot", "conditions_demandeur", "documents", "frais", "delai_indicatif", "sources"]);
    requiredText(visa.type, where + ".type");
    shape(visa.autorite_competente, where + ".autorite_competente", ["nom", "ville", "pays"]);
    for (const key of ["nom", "ville", "pays"]) requiredText(visa.autorite_competente[key], where + ".autorite_competente." + key);
    shape(visa.lieu_depot, where + ".lieu_depot", ["categorie", "nom", "adresse", "rendez_vous_url"]);
    if (!["ambassade", "centre_externe", "en_ligne", ...(demo ? ["a_confirmer"] : [])].includes(visa.lieu_depot.categorie))
      fail(where + ".lieu_depot.categorie", "type de lieu invalide");
    requiredText(visa.lieu_depot.nom, where + ".lieu_depot.nom");
    requiredText(visa.lieu_depot.adresse, where + ".lieu_depot.adresse");
    if (demo && visa.lieu_depot.categorie === "a_confirmer" && visa.lieu_depot.rendez_vous_url === null) {
      // The sample must not invent a booking URL.
    } else https(visa.lieu_depot.rendez_vous_url, where + ".lieu_depot.rendez_vous_url");
    shape(visa.conditions_demandeur, where + ".conditions_demandeur", ["public_cible", "autres_cas"]);
    requiredText(visa.conditions_demandeur.public_cible, where + ".conditions_demandeur.public_cible");
    if (visa.conditions_demandeur.autres_cas !== "Consultez l’ambassade.")
      fail(where + ".conditions_demandeur.autres_cas", "texte prudent obligatoire");
    if (!Array.isArray(visa.documents) || visa.documents.length < 1) fail(where + ".documents", "au moins un document obligatoire");
    for (const [j, document] of visa.documents.entries()) {
      const dw = where + ".documents[" + j + "]";
      shape(document, dw, ["libelle", "statut", "note"]);
      requiredText(document.libelle, dw + ".libelle");
      if (!ALLOWED_STATUSES.includes(document.statut)) fail(dw + ".statut", "obligatoire ou selon_le_cas attendu");
      requiredText(document.note, dw + ".note");
    }
    for (const k of ["frais", "delai_indicatif"]) {
      shape(visa[k], where + "." + k, ["texte", "verifie_le"]);
      requiredText(visa[k].texte, where + "." + k + ".texte");
      parseDate(visa[k].verifie_le, where + "." + k + ".verifie_le", today);
    }
    if (!Array.isArray(visa.sources) || visa.sources.length < 1) fail(where + ".sources", "au moins une source officielle HTTPS obligatoire");
    for (const [j, source] of visa.sources.entries()) {
      const sw = where + ".sources[" + j + "]";
      shape(source, sw, ["libelle", "url"]);
      requiredText(source.libelle, sw + ".libelle");
      https(source.url, sw + ".url");
    }
  }
  return entry;
}
function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
}
function e(value) { return esc(value); }
function link(url, label, extra = "") {
  return '<a href="' + e(url) + '" rel="noopener noreferrer" target="_blank"' + extra + ">" + e(label) + "</a>";
}
function docLabel(status) { return status === "obligatoire" ? "Obligatoire" : "Selon le cas"; }
function niceDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})
    .format(new Date(date + "T00:00:00Z"));
}
function dateNote(date, demo) {
  return demo ? "Date technique d’exemple — NON VÉRIFIÉ" : "Vérifié le " + niceDate(date);
}
function shell({title,description,body,demo}) {
  return [
    "<!doctype html>",
    "<!-- BEAM_VISAS_GENERATED: do not edit the HTML, edit visas/data/*.json -->",
    '<html lang="fr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    demo ? '<meta name="robots" content="noindex,nofollow,noarchive">' : '<meta name="robots" content="index,follow">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;self&#39;; script-src &#39;none&#39;; img-src &#39;self&#39;; font-src &#39;none&#39;; connect-src &#39;none&#39;; object-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    "<title>" + e(title) + "</title>",
    '<meta name="description" content="' + e(description) + '">',
    '<link rel="stylesheet" href="/visas/style.css">',
    "</head><body>",
    '<a class="skip-link" href="#contenu">Aller au contenu</a>',
    '<header class="masthead"><div class="wrap masthead-inner">',
    '<a class="wordmark" href="/visas/" aria-label="BEAM — Guide des visas depuis Conakry">BEAM<span> / Visas</span></a>',
    '<span class="not-official">Guide indépendant · Non officiel</span>',
    "</div></header>",
    '<main class="wrap" id="contenu">' + body + "</main>",
    '<footer class="site-footer"><div class="wrap"><p>' + e(DISCLAIMER) + '</p>',
    '<p>BEAM · Guide public indépendant depuis Conakry.</p></div></footer>',
    "</body></html>"
  ].join("\n") + "\n";
}
function staleBanner(entry, today) {
  if (!needsReview(entry, today)) return "";
  return '<aside class="notice notice-stale" role="status"><strong>Informations à revérifier</strong><p>Au moins une date de vérification (fiche, frais ou délai) dépasse 90 jours. Consultez la source officielle avant toute démarche.</p></aside>';
}
function demoBanner() {
  return '<aside class="notice notice-demo" role="status"><strong>EXEMPLE — NON VÉRIFIÉ</strong><p>Cette fiche sert uniquement à illustrer la structure. Elle ne fournit aucune exigence, adresse, frais ou délai vérifié. Ne préparez pas une demande à partir de cet exemple.</p></aside>';
}
function renderType(visa, demo, index) {
  const li = visa.documents.map(d => '<li class="doc"><div class="doc-title">' + e(d.libelle) +
    ' <span class="chip">' + e(docLabel(d.statut)) + '</span></div><p>' + e(d.note) + '</p></li>').join("\n");
  const urls = visa.sources.map(s => "<li>" + link(s.url,s.libelle) + "</li>").join("\n");
  const place = visa.lieu_depot;
  const linkLabel = place.categorie === "en_ligne"
    ? "Ouvrir le portail officiel" : "Ouvrir le lien officiel de rendez-vous";
  const reservation = place.rendez_vous_url === null
    ? '<p class="muted">Prise de rendez-vous : lien non renseigné pour cet exemple.</p>'
    : "<p>" + link(place.rendez_vous_url,linkLabel) + "</p>";
  const placeType = {"ambassade":"Ambassade", "centre_externe":"Centre externe",
    "en_ligne":"Démarche en ligne", "a_confirmer":"À confirmer"}[place.categorie];
  return [
    '<section class="visa-type" aria-labelledby="visa-' + index + '">',
    '<h2 id="visa-' + index + '">' + e(visa.type) + "</h2>",
    '<div class="two-col">',
    '<section class="detail-card"><h3>Autorité compétente</h3>',
    "<p><strong>" + e(visa.autorite_competente.nom) + "</strong></p>",
    "<p>" + e(visa.autorite_competente.ville) + " · " + e(visa.autorite_competente.pays) + "</p></section>",
    '<section class="detail-card"><h3>Lieu de dépôt</h3>',
    '<p><span class="chip">' + e(placeType) + "</span> " + e(place.nom) + "</p>",
    "<p>" + e(place.adresse) + "</p>",reservation,"</section>",
    '<section class="detail-card"><h3>Conditions du demandeur</h3>',
    "<p>" + e(visa.conditions_demandeur.public_cible) + "</p>",
    '<p><strong>Autres situations :</strong> ' + e(visa.conditions_demandeur.autres_cas) + "</p></section>",
    '<section class="detail-card"><h3>Frais et délais indicatifs</h3>',
    "<p><strong>Frais :</strong> " + e(visa.frais.texte) + "</p>",
    '<p class="date-note">' + e(dateNote(visa.frais.verifie_le,demo)) + "</p>",
    "<p><strong>Délai :</strong> " + e(visa.delai_indicatif.texte) + "</p>",
    '<p class="date-note">' + e(dateNote(visa.delai_indicatif.verifie_le,demo)) + "</p></section>",
    "</div>",
    '<section class="detail-card"><h3>Documents à préparer</h3><ul class="document-list">' + li + "</ul></section>",
    '<section class="sources"><h3>Sources officielles à consulter</h3><ul>' + urls + "</ul>",
    '</section>',
    "</section>"
  ].join("\n");
}
function renderDestination(entry, slug, today) {
  const demo = entry.statut === "exemple";
  const whatsapp = "https://wa.me/224622095630?text=" +
    encodeURIComponent("Bonjour BEAM, je souhaite être accompagné pour une demande de visa vers " + entry.destination + ".");
  const body = [
    '<nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="/visas/">Guide des visas</a><span aria-hidden="true"> / </span><span>' + e(entry.destination) + "</span></nav>",
    '<section class="intro"><div class="eyebrow">Depuis Conakry · Guide indépendant</div>',
    '<h1><span class="flag" aria-hidden="true">' + e(entry.drapeau) + "</span> Visa : " + e(entry.destination) + "</h1>",
    '<p class="lead">Informations générales destinées à préparer vos vérifications auprès des autorités compétentes.</p>',
    '<p class="date-note">' + e(dateNote(entry.verifie_le,demo)) + "</p></section>",
    demo ? demoBanner() : "",
    staleBanner(entry,today),
    '<aside class="notice notice-law"><strong>À lire avant toute démarche</strong><p>' + e(DISCLAIMER) + "</p></aside>",
    entry.types_visa.map((type,i)=>renderType(type,demo,i)).join("\n"),
    '<section class="next"><h2>Besoin d’aide pour préparer votre dossier ?</h2>',
    '<p>BEAM peut vous accompagner dans l’organisation de vos démarches, sans pouvoir garantir une décision consulaire.</p>',
    '<div class="actions">' + link(whatsapp,"Être accompagné par BEAM",' class="button primary"') +
    '<a class="button secondary" href="/travel/">Conservez votre historique de voyages avec BTH</a></div></section>'
  ].join("\n");
  return shell({
    title:"Visa " + entry.destination + " depuis Conakry | Guide BEAM",
    description:"Guide indépendant BEAM : " + entry.destination + ". Informations indicatives, sources officielles et dates de vérification.",
    body,demo
  });
}
function renderHome(entries,today) {
  if (entries.length === 0) {
    const whatsapp = "https://wa.me/224622095630?text=" +
      encodeURIComponent("Bonjour BEAM, je souhaite être accompagné pour une demande de visa depuis Conakry.");
    return shell({
      title:"Guide en préparation | Visas depuis Conakry — BEAM",
      description:"Guide des visas BEAM en préparation. Consultez les autorités compétentes et contactez BEAM pour un accompagnement.",
      demo:true, // No published fiche: prevent indexing an empty guide.
      body:[
        '<section class="intro"><div class="eyebrow">Guide indépendant · Depuis Conakry</div>',
        '<h1>Guide en préparation</h1>',
        '<p class="lead">Les fiches sont en cours de vérification. Aucune destination n’est publiée pour le moment.</p></section>',
        '<aside class="notice notice-law"><strong>Information importante</strong><p>' + e(DISCLAIMER) + '</p></aside>',
        '<section class="next"><h2>Besoin d’être accompagné ?</h2>',
        '<p>BEAM peut vous aider à organiser vos démarches sans garantir une décision consulaire.</p>',
        '<div class="actions">' + link(whatsapp,"Être accompagné par BEAM",' class="button primary"') +
        '<a class="button secondary" href="/travel/">Conservez votre historique de voyages avec BTH</a></div></section>'
      ].join("\n")
    });
  }
  const cards=entries.map(({slug,entry})=>{
    const demo=entry.statut==="exemple";
    return '<li><article class="destination-card"><div class="flag" aria-hidden="true">' + e(entry.drapeau) + "</div>" +
      '<h2><a href="/visas/' + e(slug) + '/">' + e(entry.destination) + "</a></h2>" +
      '<p class="date-note">' + e(dateNote(entry.verifie_le,demo)) + "</p>" +
      (demo?'<p class="chip warn">EXEMPLE — NON VÉRIFIÉ</p>':"") +
      (needsReview(entry,today)?'<p class="stale-label">Informations à revérifier</p>':"") +
      '<p><a class="details-link" href="/visas/' + e(slug) + '/">Voir la fiche →</a></p></article></li>';
  }).join("\n");
  const demo=entries.some(x=>x.entry.statut==="exemple");
  const body=[
    '<section class="intro"><div class="eyebrow">Guide public et indépendant</div>',
    "<h1>Guide des visas depuis Conakry</h1>",
    '<p class="lead">Repérez les autorités, centres de dépôt, documents et sources à vérifier avant de préparer votre dossier.</p></section>',
    demo?demoBanner():"",
    '<aside class="notice notice-law"><strong>Important</strong><p>' + e(DISCLAIMER) + "</p></aside>",
    '<section class="list-section"><h2>Destinations</h2><ul class="destination-list">' + cards + "</ul></section>",
    '<section class="next"><h2>Votre parcours de voyageur</h2>',
    '<p>Conservez vos voyages dans un carnet personnel distinct du guide des visas.</p>',
    '<a class="button secondary" href="/travel/">Conservez votre historique de voyages avec BTH</a></section>'
  ].join("\n");
  return shell({title:"Guide des visas depuis Conakry | BEAM",description:"Guide de visas indépendant BEAM, avec sources officielles, dates de vérification et informations indicatives.",body,demo});
}
function buildSite({root=path.resolve(__dirname,".."),mode="preview",today=todayUTC(),logger=console}={}) {
  if (!["preview","production","check"].includes(mode)) fail("mode", "mode invalide");
  parseDate(today,"date de construction",todayUTC());
  const dataDir=path.join(root,"visas","data");
  let files;
  try {
    files=fs.readdirSync(dataDir).filter(n=>n.endsWith(".json")).sort();
  } catch(error) {
    if (error.code==="ENOENT") files=[];
    else throw error;
  }
  // No published data is a valid state: always render "Guide en préparation".
  // Strict CI still rejects every invalid JSON that is present.

  const entries=[],excluded=[];
  for (const filename of files) {
    const slug=filename.slice(0,-5);
    try {
      // Filename is used in paths; validate before constructing an output path.
      if(!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) fail(filename,"nom de fichier dangereux");
      const entry=JSON.parse(fs.readFileSync(path.join(dataDir,filename),"utf8"));
      if (mode==="production" && containsExample(entry))
        fail(filename,"EXEMPLE — NON VÉRIFIÉ : fiche exclue de la production");
      validateEntry(entry,slug,{mode:mode==="check"?"preview":mode,today});
      if(entry.statut==="publie" && entries.some(item=>
        item.entry.statut==="publie" && item.entry.code_pays===entry.code_pays))
        fail(filename,"code_pays déjà publié pour une autre destination");
      entries.push({slug,entry});
    } catch(error) {
      if (mode!=="production") fail(filename,error.message);
      const reason=error.message;
      excluded.push({filename,reason});
      logger.warn("[visas] Fiche exclue de la production : "+filename+" — "+reason);
    }
  }
  // CI validates the complete set and never writes generated HTML.
  if (mode==="check") return {mode,files:files.length,html:0,published:entries.length,excluded,date:today};

  const destDir=path.join(root,"visas");
  fs.mkdirSync(destDir,{recursive:true});
  const outputSlugs=new Set(entries.map(({slug})=>slug));
  // A production build may reuse a workspace that previously rendered a
  // preview. Never leave a stale HTML file for an excluded destination.
  // Also clean old generated destinations if their JSON source was removed.
  if (mode==="production") {
    for (const item of fs.readdirSync(destDir,{withFileTypes:true})) {
      if (!item.isDirectory() || !/^[a-z][a-z0-9-]{1,39}$/.test(item.name) ||
          item.name==="data" || outputSlugs.has(item.name)) continue;
      const dest=path.join(destDir,item.name),file=path.join(dest,"index.html");
      if(!fs.existsSync(file)) continue;
      const owned=files.includes(item.name+".json") ||
        fs.readFileSync(file,"utf8").includes("BEAM_VISAS_GENERATED");
      if(!owned) continue; // Do not delete unrelated manually maintained pages.
      fs.rmSync(file);
      try { fs.rmdirSync(dest); } catch(error) {
        if(error.code!=="ENOTEMPTY") throw error;
      }
    }
  }
  fs.writeFileSync(path.join(destDir,"index.html"),renderHome(entries,today),"utf8");
  // Public, data-minimal index for BTH. Never include example, draft, travel
  // records, URLs from source fiches or other editorial fields. Regenerate from
  // scratch on every build so unpublished/removed fiches disappear immediately.
  const publicFiches=entries
    .filter(({entry})=>entry.statut==="publie"&&!containsExample(entry))
    .map(({slug,entry})=>({code_pays:entry.code_pays,slug,destination:entry.destination}));
  fs.writeFileSync(path.join(destDir,"fiches.json"),JSON.stringify(publicFiches,null,2)+"\n","utf8");
  fs.writeFileSync(path.join(destDir,"404.html"),shell({
    title:"Page introuvable | BEAM Visas",
    description:"Cette ressource n’est pas disponible sur le Guide des visas de BEAM.",
    body:'<section class="intro"><h1>Page introuvable</h1><p>Cette ressource n’est pas disponible.</p><p><a href="/visas/">Retour au Guide des visas</a></p></section>',
    demo:true
  }),"utf8");
  for(const {slug,entry} of entries){
    const output=path.join(destDir,slug);
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,"index.html"),renderDestination(entry,slug,today),"utf8");
  }
  logger.log("[visas] "+mode+" : "+entries.length+" fiche(s) publiée(s), "+
    excluded.length+" exclue(s).");
  if (mode==="production" && excluded.length)
    logger.log("[visas] Exclusions : "+excluded.map(item=>item.filename).join(", "));
  return {mode,files:files.length,html:entries.length+1,published:entries.length,excluded,date:today};
}
if(require.main===module) {
  try {
    const mode=modeFor();
    const result=buildSite({mode});
    console.log("BEAM visas : "+result.files+" fichier(s) examiné(s), "+
      result.published+" publié(s), "+result.excluded.length+" exclu(s) ; mode "+result.mode);
  }catch(error){console.error("Échec du guide des visas : "+error.message);process.exitCode=1;}
}
module.exports={MARKER,DISCLAIMER,parseDate,https,isStale,needsReview,modeFor,containsExample,validateEntry,renderDestination,renderHome,buildSite,esc,todayUTC};
