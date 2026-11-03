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
  const filenames=fs.readdirSync(sourceDir).filter(name=>name.endsWith(".json")).sort();
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
  const widths=[320,360,375,390];
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
       // The public checklist must not reveal notes or document statuses.
       for(const doc of type.documents)
        assert.equal(await sectionEl.locator(".documents-card").getByText(doc.note,{exact:true}).count(),0);
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
   }finally{await context.close();}
  }

  // Synthetic online demo is never copied to visas/data in the repository or
  // included in the production build. Exercise its label on every mobile size.
  const demo=JSON.parse(fs.readFileSync(path.join(repositoryRoot,"tests/fixtures/visas/exemple.json"),"utf8"));
  demo.destination="Destination fictive de test";
  demo.types_visa[0].lieu_depot.categorie="en_ligne";
  demo.types_visa[0].lieu_depot.rendez_vous_url="https://example.org/portail-de-test";
  fs.writeFileSync(path.join(root,"visas/data/test-en-ligne.json"),JSON.stringify(demo));
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
    const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(scroll<=width+1,"online demo overflows at "+width+"px");
    assert.deepEqual(outsiders,[],"online test page must not load third-party resources");
    await page.screenshot({path:path.join(out,"en-ligne-exemple-"+width+".png"),fullPage:true,animations:"disabled"});
    console.log("PASS online-only test fixture "+width+"px");
   }finally{await context.close();}
  }
 }finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(scratch,{recursive:true,force:true});
 }
}
main().catch(err=>{console.error(err);process.exitCode=1});
