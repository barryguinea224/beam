"use strict";
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {chromium}=require("playwright");
const {buildSite}=require("../scripts/build-visas.cjs");
const repositoryRoot=path.resolve(__dirname,"..");
let root=repositoryRoot;
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
function serve(){
 return http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(!pathname.startsWith("/visas/")){res.writeHead(404);return res.end();}
  const filename=pathname.endsWith("/")?pathname+"index.html":pathname;
  const dest=path.resolve(root,"."+filename);
  if(!dest.startsWith(path.join(root,"visas")+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(dest,(err,data)=>{
   if(err){res.writeHead(404);return res.end();}
   res.writeHead(200,{"content-type":mime[path.extname(dest)]||"application/octet-stream","cache-control":"no-store"});
   res.end(data);
  });
 });
}
function lum(c){
 const m=c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
 assert.ok(m,"computed color must be RGB: "+c);
 const colors=m.slice(1,4).map(n=>Number(n)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return colors[0]*.2126+colors[1]*.7152+colors[2]*.0722;
}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function main(){
 // Test the real published BEAM JSON files without editing their contents.
 // The online-only demonstration is added later to a disposable test directory.
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"beam-visas-browser-"));
 root=scratch;
 let server=null,browser=null;
 try{
  fs.mkdirSync(path.join(root,"visas/data"),{recursive:true});
  fs.copyFileSync(path.join(repositoryRoot,"visas/style.css"),path.join(root,"visas/style.css"));
  const sourceDir=path.join(repositoryRoot,"visas/data");
  const filenames=fs.readdirSync(sourceDir).filter(name=>name.endsWith(".json")&&name!=="secrets.json").sort();
  const slugs=filenames.map(name=>name.slice(0,-5));
  assert.ok(slugs.length>=5,"expected the five already published BEAM destination fiches");
  for(const required of ["canada","chine","france","royaume-uni","turquie"])
   assert.ok(slugs.includes(required),"missing existing destination: "+required);
  if(slugs.includes("maroc"))assert.equal(slugs.length,6,
   "with the original BEAM Morocco JSON, exactly six destinations must publish");
  const entries=new Map(filenames.map(name=>{
   const slug=name.slice(0,-5);
   const original=path.join(sourceDir,name);
   const entry=JSON.parse(fs.readFileSync(original,"utf8"));
   assert.equal(entry.statut,"publie","no demo belongs in visas/data: "+name);
   fs.copyFileSync(original,path.join(root,"visas/data",name));
   return [slug,entry];
  }));
  fs.copyFileSync(path.join(sourceDir,"secrets.json"),path.join(root,"visas/data/secrets.json"));
  const secrets=JSON.parse(fs.readFileSync(path.join(sourceDir,"secrets.json"),"utf8"));
  assert.ok(entries.get("france").types_visa.every(v=>v.documents.length>0),
   "the real BEAM France must retain its own document list, whatever its length");
  const built=buildSite({root,mode:"production"});
  assert.equal(built.published,slugs.length,"every real fiche should be publishable");
  assert.equal(built.excluded.length,0,"no real fiche may be dropped from the guide");
  server=serve();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const out=path.join(repositoryRoot,"test-artifacts/visas-mobile");
  fs.mkdirSync(out,{recursive:true});
  const widths=[320,360,375,390,768];
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   const page=await context.newPage();
   const outsiders=[];
   page.on("request",request=>{
    const url=new URL(request.url());
    if(url.hostname!=="127.0.0.1")outsiders.push(request.url());
   });
   try{
    for(const section of ["",...slugs.map(slug=>slug+"/")]){
     const slug=section.slice(0,-1);
     const url="http://127.0.0.1:"+server.address().port+"/visas/"+section;
     const response=await page.goto(url,{waitUntil:"networkidle"});
     assert.equal(response.status(),200);
     assert.equal(await page.locator("script").count(),0,"HTML must not require JS");
     assert.equal(await page.locator('link[rel="stylesheet"]').count(),1);
     assert.equal(await page.locator(".notice-demo").count(),0,"real published page cannot be a demo");
     assert.ok(await page.locator(".notice-law").isVisible());
     const metrics=await page.evaluate(()=>{
      const h=document.querySelector("h1"),header=document.querySelector(".masthead"),cta=document.querySelector(".button.primary");
      const box=x=>x?({width:x.getBoundingClientRect().width,left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right,height:x.getBoundingClientRect().height}):null;
      const color=x=>getComputedStyle(x).color;
      const bg=x=>getComputedStyle(x).backgroundColor;
      return{
       viewport:innerWidth,scroll:document.documentElement.scrollWidth,
       h1:box(h),bodyColor:color(document.body),bodyBg:bg(document.body),
       brandColor:color(header.querySelector(".wordmark")),headerBg:bg(header),
       cta:box(cta),ctaColor:cta?color(cta):null,ctaBg:cta?bg(cta):null
      };
     });
     assert.ok(metrics.h1.left>=0&&metrics.h1.right<=width+1,"heading clips "+width+"px "+slug);
     assert.ok(metrics.scroll<=width+1,"horizontal overflow "+width+"px "+slug+" "+JSON.stringify(metrics));
     assert.ok(contrast(metrics.bodyColor,metrics.bodyBg)>=4.5,"body contrast "+slug);
     assert.ok(contrast(metrics.brandColor,metrics.headerBg)>=4.5,"brand contrast "+slug);
     if(section){
      const data=entries.get(slug);
      assert.ok(metrics.cta&&metrics.cta.height>=48,"main BEAM WhatsApp target must be prominent");
      assert.match(await page.locator("h1").innerText(),new RegExp("Visa "+data.destination+"$"),
       "destination title should be direct and short");
      assert.ok(metrics.cta.right<=width+1&&metrics.cta.left>=-1,"CTA must fit screen");
      assert.ok(contrast(metrics.ctaColor,metrics.ctaBg)>=4.5,"CTA contrast "+slug);
      assert.equal(await page.locator(".doc").count(),
       data.types_visa.reduce((n,v)=>n+v.documents.length,0),
       "all source documents must render: "+slug);
      assert.equal(await page.locator(".visa-type").count(),data.types_visa.length);
      assert.ok((await page.locator(".button.primary").getAttribute("href")).includes(data.destination));
      assert.equal(await page.locator(".button.primary").innerText(),"On s'occupe de tout pour vous — WhatsApp");
      assert.equal(await page.locator('a[href="/travel/"]').count(),1);
      assert.equal(await page.locator(".visa-more").count(),1);
      assert.equal(await page.locator(".visa-more").evaluate(el=>el.open),false,
       "Plus de détails must initially be collapsed");
      assert.equal(await page.locator(".document-notes:visible").count(),0);
      const share=page.getByRole("link",{name:"Partager cette liste sur WhatsApp"});
      assert.equal(await share.count(),1);
      const shared=new URL(await share.getAttribute("href"));
      assert.equal(shared.origin,"https://wa.me");
      assert.equal(shared.pathname,"/");
      assert.equal(shared.searchParams.get("text"),
       "Visa "+data.destination+" — Documents à fournir : https://beamguinee.com/visas/"+slug+"/");
      assert.equal(await share.getAttribute("onclick"),null,
       "sharing must not require JavaScript");
      const passportLinks=page.locator(".identity-passport a");
      const expectedReminders=data.types_visa.filter(v=>v.documents.some(d=>(d.groupe||"base")==="base")).length;
      assert.equal(await passportLinks.count(),expectedReminders,
       "every real base checklist should be followed by the identité reminder");
      const supportLink=page.locator(".identity-support a.identity-support-link");
      assert.equal(await supportLink.count(),1);
      assert.match(await page.locator(".identity-passport").first().innerText(),
       /Votre passeport est-il encore valable assez longtemps/);
      for(const item of [passportLinks,supportLink]){
       const n=await item.count();
       for(let k=0;k<n;k++){
        const anchor=item.nth(k);
        assert.equal(await anchor.getAttribute("href"),"https://ididentite.com/");
        assert.equal(await anchor.getAttribute("rel"),"noopener");
        assert.equal(await anchor.getAttribute("target"),null,"same browser tab");
        assert.equal(await anchor.getAttribute("onclick"),null,"no inline JS or tracker");
        const area=await anchor.evaluate(a=>{
         const p=a.closest(".identity-passport,.identity-support");
         const r=p.getBoundingClientRect();
         return {left:r.left,right:r.right,width:r.width,scroll:document.documentElement.scrollWidth};
        });
        assert.ok(area.left>=-1&&area.right<=width+1&&area.scroll<=width+1,
         "identity link callout must fit "+width+"px "+slug+": "+JSON.stringify(area));
       }
      }
      for(const [index,type] of data.types_visa.entries()){
       const sectionEl=page.locator(".visa-type").nth(index);
       assert.equal(await sectionEl.locator(".brief-row").count(),3,
        "En bref must contain exactly three concise rows");
       const place=sectionEl.locator(".brief-row").first();
       const labels=await sectionEl.locator(".doc-label").allInnerTexts();
       const order=["base","salaries","commercants","but","autres"];
       const original=type.documents.map((doc,index)=>({doc,index}));
       const expected=original.sort((a,b)=>
        order.indexOf(a.doc.groupe||"base")-order.indexOf(b.doc.groupe||"base")||a.index-b.index)
        .map(x=>x.doc.libelle);
       assert.deepEqual(labels,expected,
        "every source document label must appear exactly once in group order");
       const groups=type.documents.map(d=>d.groupe||"base");
       const hasEmployee=groups.includes("salaries");
       const hasEntrepreneur=groups.includes("commercants");
       const profiles=sectionEl.locator(".profile-situation");
       assert.equal(await profiles.count(),hasEmployee||hasEntrepreneur?1:0,
        "profile section exists only when the fiche contains profile documents");
       assert.equal(await sectionEl.locator(".profile-card-employee").count(),hasEmployee?1:0);
       assert.equal(await sectionEl.locator(".profile-card-entrepreneur").count(),hasEntrepreneur?1:0);
       if(hasEmployee||hasEntrepreneur){
        assert.equal(await profiles.locator("h4").innerText(),"Selon votre situation");
        assert.equal(await profiles.locator(".profile-subtitle").innerText(),
          "En plus des documents de base");
        if(hasEmployee)assert.equal(await profiles.locator(".profile-card-employee h5").innerText(),
          "👔 Vous êtes salarié(e)");
        if(hasEntrepreneur)assert.equal(await profiles.locator(".profile-card-entrepreneur h5").innerText(),
          "🏪 Vous êtes entrepreneur ou commerçant");
        const geometry=await profiles.evaluate(section=>{
         const cards=[...section.querySelectorAll(".profile-card")];
         const a=cards.map(el=>{const b=el.getBoundingClientRect();return {
          left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,
          background:getComputedStyle(el).backgroundColor,
          colors:[el,...el.querySelectorAll("h5,.doc-label,.doc-check")]
           .map(node=>getComputedStyle(node).color)
         }});
         const grid=section.querySelector(".profile-grid");
         return {cards:a,columns:getComputedStyle(grid).gridTemplateColumns,
          scroll:document.documentElement.scrollWidth};
        });
        assert.equal(geometry.cards.length,Number(hasEmployee)+Number(hasEntrepreneur));
        assert.ok(geometry.scroll<=width+1,"no profile horizontal overflow "+slug+" "+width);
        for(const card of geometry.cards){
         assert.ok(card.left>=-1 && card.right<=width+1,"profile card must fit the viewport");
         for(const color of card.colors)
          assert.ok(contrast(color,card.background)>=4.5,
           "profile text/checkmark contrast below 4.5:1 for "+slug+" "+width);
        }
        if(hasEmployee&&hasEntrepreneur){
         const [left,right]=geometry.cards;
         if(width>=600){
          assert.ok(Math.abs(left.top-right.top)<=2 && right.left>=left.right-2,
           "profile cards must be side by side at "+width+"px: "+JSON.stringify(geometry));
         }else{
          assert.ok(right.top>=left.bottom-2,
           "profile cards must stack at "+width+"px: "+JSON.stringify(geometry));
         }
        }
       }
       if(groups.includes("base")){
        const baseWidth=await sectionEl.locator(".document-group-base").evaluate(el=>{
         const panel=el.closest(".documents-card"),st=getComputedStyle(panel);
         return {actual:el.getBoundingClientRect().width,
          available:panel.getBoundingClientRect().width-
           parseFloat(st.paddingLeft)-parseFloat(st.paddingRight)-
           parseFloat(st.borderLeftWidth)-parseFloat(st.borderRightWidth)};
        });
        assert.ok(Math.abs(baseWidth.actual-baseWidth.available)<3,
         "base documents must span the full content width "+width+"px: "+JSON.stringify(baseWidth));
       }
       // Inline notes disambiguate non-mandatory base documents only.
       const expectedInline=type.documents.filter(doc=>
        (doc.groupe||"base")==="base" && doc.statut==="selon_le_cas");
       assert.deepEqual(
        await sectionEl.locator(".document-group-base .doc-note").allInnerTexts(),
        expectedInline.map(doc=>" — "+doc.note),
        "conditional base notes must appear once, immediately after their labels");
       assert.equal(await sectionEl.locator(".doc-note").count(),expectedInline.length,
        "profile, trip-purpose and complementary notes must stay in details");
       for(const doc of type.documents){
        if((doc.groupe||"base")==="base" && doc.statut==="selon_le_cas")continue;
        assert.equal(await sectionEl.locator(".documents-card").getByText(doc.note,{exact:true}).count(),0);
       }
       for(const note of await sectionEl.locator(".doc-note").all()){
        const size=await note.evaluate(el=>({
         px:parseFloat(getComputedStyle(el).fontSize),
         right:el.getBoundingClientRect().right,
         scroll:document.documentElement.scrollWidth
        }));
        assert.ok(size.px>=12 && size.right<=width+1 && size.scroll<=width+1,
         "conditional notes must remain legible and fit Android "+width+"px: "+JSON.stringify(size));
       }
       const more=page.locator(".visa-more");
       for(const doc of type.documents)
        assert.ok((await more.textContent()).includes(doc.note),
          "all source document notes must remain available in collapsed details");
       assert.ok(groups.every(g=>["base","salaries","commercants","but","autres"].includes(g)));
       if(type.lieu_depot.categorie==="en_ligne"){
        assert.equal(await place.locator(".chip").innerText(),"Démarche en ligne");
        const portal=place.getByRole("link",{name:"Ouvrir le portail officiel"});
        assert.equal(await portal.count(),1);
        assert.equal(await portal.getAttribute("href"),type.lieu_depot.rendez_vous_url);
       }else{
        assert.equal(await place.getByRole("link",{name:"Ouvrir le lien officiel de rendez-vous"}).count(),1);
       }
      }
     }else{
      assert.doesNotMatch(await page.locator("h1").innerText(),/Guide en préparation/);
      for(const destination of slugs)
       assert.ok(await page.locator('a[href="/visas/'+destination+'/"]').count()>=1,
        "home must link to "+destination);
     }
     assert.deepEqual(outsiders,[],"no third-party requests for static page");
     if(section){
      await page.locator(".visa-more summary").click();
      assert.equal(await page.locator(".visa-more").evaluate(el=>el.open),true);
      assert.ok(await page.locator(".document-notes").first().isVisible());
      assert.ok(await page.locator(".sources-list").first().isVisible());
      assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+1,
       "expanded details must not overflow at "+width+"px");
      await page.locator(".visa-more summary").click();
     }
     const filename=section?slug:"accueil";
     await page.screenshot({path:path.join(out,filename+"-"+width+".png"),fullPage:true,animations:"disabled"});
     console.log("PASS published visa guide "+filename+" "+width+"px: no JS, no overflow, no remote resources");
    }
    if(width===360){
     const response=await page.goto("http://127.0.0.1:"+server.address().port+"/visas/secrets/",{waitUntil:"networkidle"});
     assert.equal(response.status(),200,"secrets page exists in the production build");
     assert.equal(await page.locator("script").count(),0,"secrets page has no browser JavaScript");
     assert.equal(await page.locator(".secrets-chapter").count(),secrets.chapitres.length);
     assert.equal(await page.locator("h1").innerText(),secrets.titre);
     assert.equal(await page.locator(".lead").innerText(),secrets.introduction);
     assert.deepEqual(await page.locator(".secrets-chapter h2").allInnerTexts(),
      secrets.chapitres.map((chapter,i)=>(i+1)+". "+chapter.titre));
     assert.deepEqual(await page.locator(".secrets-tips li").allInnerTexts(),
      secrets.chapitres.flatMap(chapter=>chapter.conseils));
     assert.ok(await page.locator(".notice-law").isVisible());
     assert.equal(await page.locator(".button.primary").innerText(),"On s'occupe de tout pour vous — WhatsApp");
     assert.ok((await page.locator(".button.primary").getAttribute("href")).startsWith("https://wa.me/224622095630?text="));
     assert.ok(await page.getByText("Vérifié par BEAM le 11/11/2026. Les règles changent : confirmez toujours auprès de l'ambassade ou de la compagnie.").isVisible());
     const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
     assert.ok(scroll<=361,"secrets page must have no horizontal overflow at 360px: "+scroll);
     assert.deepEqual(outsiders,[],"secrets page must load no third-party assets");
     await page.screenshot({path:path.join(out,"secrets-360.png"),fullPage:true,animations:"disabled"});
     console.log("PASS secrets page 360px: 8 chapters, 28 tips, no JS, no overflow");
    }
   }finally{await context.close();}
  }

  // Synthetic online demo is never copied to visas/data in the repository or
  // included in the production build. Exercise its label on every mobile size.
  const demo=JSON.parse(fs.readFileSync(path.join(repositoryRoot,"tests/fixtures/visas/exemple.json"),"utf8"));
  demo.destination="Destination fictive de test";
  demo.types_visa[0].lieu_depot.categorie="en_ligne";
  demo.types_visa[0].lieu_depot.rendez_vous_url="https://example.org/portail-de-test";
  // Private test fixture only: exercise the five optional groups at every
  // phone width without inventing any content in the six BEAM data files.
  const base=demo.types_visa[0].documents[0];
  demo.types_visa[0].documents=[
   {...base,libelle:"Document fictif sans groupe"},
   ...["base","salaries","commercants","but","autres"].map(g=>({
    ...base,groupe:g,libelle:"Document fictif — "+g
   }))
  ];
  fs.writeFileSync(path.join(root,"visas/data/test-en-ligne.json"),JSON.stringify(demo));
  // These two additional fixtures remain in the disposable test root; they
  // verify no empty "Selon votre situation" section and a single-card case.
  const withoutProfiles=JSON.parse(JSON.stringify(demo));
  withoutProfiles.types_visa[0].documents=withoutProfiles.types_visa[0].documents
   .filter(doc=>!["salaries","commercants"].includes(doc.groupe));
  fs.writeFileSync(path.join(root,"visas/data/test-sans-profil.json"),JSON.stringify(withoutProfiles));
  const oneProfile=JSON.parse(JSON.stringify(demo));
  oneProfile.types_visa[0].documents=oneProfile.types_visa[0].documents
   .filter(doc=>doc.groupe!=="commercants");
  fs.writeFileSync(path.join(root,"visas/data/test-profil-unique.json"),JSON.stringify(oneProfile));
  buildSite({root,mode:"preview"});
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   try{
    const page=await context.newPage();
    const outsiders=[];
    page.on("request",request=>{
     if(new URL(request.url()).hostname!=="127.0.0.1")outsiders.push(request.url());
    });
    const response=await page.goto("http://127.0.0.1:"+server.address().port+"/visas/test-en-ligne/",{waitUntil:"networkidle"});
    assert.equal(response.status(),200);
    assert.ok(await page.locator(".notice-demo").isVisible());
    assert.equal(await page.locator(".brief-row").first().locator(".chip").innerText(),"Démarche en ligne");
    const portal=page.getByRole("link",{name:"Ouvrir le portail officiel"});
    assert.equal(await portal.count(),1);
    assert.equal(await portal.getAttribute("href"),"https://example.org/portail-de-test");
    const labels=await page.locator(".doc-label").allInnerTexts();
    assert.deepEqual(labels,["Document fictif sans groupe","Document fictif — base",
     "Document fictif — salaries","Document fictif — commercants",
     "Document fictif — but","Document fictif — autres"]);
    assert.deepEqual(await page.locator(".document-group h4").allInnerTexts(),
     ["Documents de base","Selon le but du voyage","Documents complémentaires"]);
    assert.equal(await page.locator(".profile-situation>h4").innerText(),"Selon votre situation");
    assert.equal(await page.locator(".profile-subtitle").innerText(),"En plus des documents de base");
    assert.deepEqual(await page.locator(".profile-card h5").allInnerTexts(),
     ["👔 Vous êtes salarié(e)","🏪 Vous êtes entrepreneur ou commerçant"]);
    assert.equal(await page.locator(".visa-more").evaluate(el=>el.open),false);
    let scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(scroll<=width+1,"online grouped demo overflows at "+width+"px");
    await page.locator(".visa-more summary").click();
    assert.ok(await page.locator(".document-notes").isVisible());
    scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(scroll<=width+1,"expanded grouped demo overflows at "+width+"px");
    await page.locator(".visa-more summary").click();
    assert.deepEqual(outsiders,[],"online test page must not load third-party resources");
    await page.screenshot({path:path.join(out,"en-ligne-exemple-"+width+".png"),fullPage:true,animations:"disabled"});
    // No profile groups: the whole heading, subtitle and grid disappear.
    let next=await page.goto("http://127.0.0.1:"+server.address().port+
     "/visas/test-sans-profil/",{waitUntil:"networkidle"});
    assert.equal(next.status(),200);
    assert.equal(await page.locator(".profile-situation,.profile-card,.profile-grid").count(),0);
    assert.equal(await page.getByText("Selon votre situation",{exact:true}).count(),0);
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+1);
    await page.screenshot({path:path.join(out,"sans-profil-"+width+".png"),fullPage:true,animations:"disabled"});
    // One profile group: exactly one card without an empty second column.
    next=await page.goto("http://127.0.0.1:"+server.address().port+
     "/visas/test-profil-unique/",{waitUntil:"networkidle"});
    assert.equal(next.status(),200);
    assert.equal(await page.locator(".profile-card").count(),1);
    assert.equal(await page.locator(".profile-card-employee").count(),1);
    assert.equal(await page.locator(".profile-card-entrepreneur").count(),0);
    assert.equal(await page.locator(".profile-grid.single-profile").count(),1);
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+1);
    await page.screenshot({path:path.join(out,"profil-unique-"+width+".png"),fullPage:true,animations:"disabled"});
    console.log("PASS online-only, no-profile and single-profile fixtures "+width+"px");
   }finally{await context.close();}
  }
 }finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(scratch,{recursive:true,force:true});
 }
}
main().catch(err=>{console.error(err);process.exitCode=1});
