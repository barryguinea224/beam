"use strict";
// Real application in Chromium; only invented journeys and synthetic owner.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const dir=path.resolve("test-artifacts/premium-cards");
const fake='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="800" height="450" fill="#9bbdae"/><path d="M0 320Q190 100 360 270T800 220V450H0" fill="#6f9e86"/><circle cx="620" cy="100" r="58" fill="#ecdfb2"/></svg>';
function seededSupabase(){
 const user="22222222-2222-4222-8222-222222222222";
 const rows=window.__excursionFixture.rows;
 rows.push({id:"66666666-6666-4666-8666-666666666666",country_code:"GN",cities:["Labé"],
  entry_date:"2024-02-02",exit_date:"2024-02-10",duration_days:9,purpose:"famille",is_domestic:true,deleting:false});
 rows.push({id:"77777777-7777-4777-8777-777777777777",country_code:"SN",cities:["Dakar"],
  entry_date:"2025-09-02",exit_date:"2025-09-10",duration_days:9,purpose:"affaires",is_domestic:false,deleting:false});
 rows[0].cover_media_id="88888888-8888-4888-8888-888888888888";
 rows[0].title="Carnet parisien";
 rows[0].companions="Aïssatou";
 rows[0].airline="Compagnie fictive";
 rows[0].hotel="Hôtel fictif";
 const photo={id:rows[0].cover_media_id,trip_id:rows[0].id,user_id:user,
  storage_path:user+"/trip/photo-fictive.webp",is_favorite:true,created_at:"2026-11-01T12:00:00Z"};
 const create=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=create(...args),from=client.from.bind(client);
  client.from=table=>{
   if(table!=="media")return from(table);
   const state={where:[]};
   const q={select(){return q},eq(field,value){state.where.push([field,value]);return q},
    order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:null,error:null})},
    then(done,failed){
     const same=state.where.find(x=>x[0]==="trip_id")?.[1]===photo.trip_id&&
      state.where.find(x=>x[0]==="user_id")?.[1]===photo.user_id;
     return Promise.resolve({data:same?[photo]:[],error:null}).then(done,failed);
    }};
   return q;
  };
  client.storage.from=()=>({createSignedUrl:async()=>({
   data:{signedUrl:"https://fixture.invalid/storage/v1/object/sign/media/photo-fictive.webp?token=SYNTHETIC_ONLY"},error:null
  })});
  return client;
 };
}
async function main(){
 await fs.mkdir(dir,{recursive:true});
 const server=serve();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await context.newPage(),errors=[],privateRequests=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.hostname==="127.0.0.1"&&url.pathname==="/travel/vendor/supabase.umd.js")
     return route.fulfill({status:200,contentType:"application/javascript",
      body:"("+fictionalSupabase.toString()+")();("+seededSupabase.toString()+")();"});
    if(url.hostname==="fixture.invalid"){
     assert.match(url.pathname,/^\/storage\/v1\/object\/sign\/media\//);
     privateRequests.push(url.href);
     return route.fulfill({status:200,contentType:"image/svg+xml",body:fake});
    }
    if(url.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+server.address().port+"/travel/",{waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.locator("#trips .journeyTrip").first().waitFor();
    assert.equal(await page.locator("#trips .journeyTrip").count(),4);
    assert.equal(await page.locator(".completedTripsList .journeyTrip").count(),3);
    assert.equal(await page.locator(".upcomingTripsSection .journeyTrip").count(),1);
    assert.match(await page.locator(".upcomingTripsSection").innerText(),/À venir/);
    assert.equal((await page.locator("#tripListSummary").innerText()).trim(),"4 voyages · 4 pays");
    assert.doesNotMatch(await page.locator("#app").innerText(),/payss/i,"No malformed country plural anywhere in rendered app");
    const cards=page.locator(".completedTripsList .journeyTrip");
    assert.equal(await cards.first().locator(".journeyCountry").innerText(),"Carnet parisien");
    assert.equal(await cards.first().locator(".journeyCode").innerText(),"France");
    assert.equal(await cards.nth(1).locator(".journeyCountry").innerText(),"Sénégal","Untitled trip uses country");
    for(const secret of ["Aïssatou","Compagnie fictive","Hôtel fictif"])
     assert.doesNotMatch(await cards.first().innerText(),new RegExp(secret),"Secondary info stays in detail");
    assert.ok(await cards.first().locator(".journeyOpenLabel").isVisible());
    assert.equal(await cards.first().locator("button").count(),1);
    assert.equal(await page.locator(".journeyShade").count(),0);
    await page.locator(".completedTripsList .journeyTrip").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector(".journeyPhotoCount")?.textContent==="1 photo");
    assert.equal(await page.locator(".journeyPhotoCount").count(),1);
    const badgeLayout=await cards.first().evaluate(card=>{
     const country=card.querySelector(".journeyFlagLine").getBoundingClientRect(),photos=card.querySelector(".journeyPhotoCount").getBoundingClientRect();
     return {countryRight:country.right,photosLeft:photos.left,countryTop:country.top,photosTop:photos.top};
    });
    assert.ok(badgeLayout.countryRight<=badgeLayout.photosLeft&&Math.abs(badgeLayout.countryTop-badgeLayout.photosTop)<=1,"Pays à gauche et photos à droite, sans chevauchement : "+JSON.stringify(badgeLayout));
    assert.ok(privateRequests.every(url=>url.startsWith("https://fixture.invalid/storage/v1/object/sign/media/")));
    const coverFallback=page.locator(".journeyTrip").filter({hasText:"Guinée"});
    assert.equal(await coverFallback.locator(".journeyBackdrop").getAttribute("src"),"./assets/countries/gn.svg");
    const upcomingBadge=page.locator(".journeyTrip .journeyStatus-upcoming");
    assert.equal(await upcomingBadge.count(),1,"Upcoming status remains visible");
    const badges=await page.locator(".journeyStatus").evaluateAll(nodes=>nodes.map(el=>{
     const css=getComputedStyle(el),lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number)
      .map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
      .reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
     const a=lum(css.color),b=lum(css.backgroundColor);
     return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    }));
    assert.ok(badges.length&&badges.every(ratio=>ratio>=4.5),"Status labels have >=4.5 contrast");
    const geometry=await page.evaluate(()=>({
     scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
     cards:[...document.querySelectorAll(".journeyTrip")].map(card=>{
      const media=card.querySelector(".journeyMedia"),body=card.querySelector(".journeyContent"),m=media.getBoundingClientRect(),b=body.getBoundingClientRect();
      return {ratio:m.width/m.height,contentOverMedia:b.top>=m.top-1&&b.bottom<=m.bottom+1,
       button:card.querySelectorAll("button").length===1,right:card.getBoundingClientRect().right};
     })
    }));
    assert.ok(geometry.scrollWidth<=width+1,"No Android overflow: "+JSON.stringify(geometry));
    assert.ok(geometry.cards.every(x=>Math.abs(x.ratio-4/5)<.02&&x.contentOverMedia&&x.button&&x.right<=width+1));
    if(width===390){
     await page.screenshot({path:path.join(dir,"accueil-deux-cartes-390.png"),
      fullPage:true,animations:"disabled"});
    }
    if(width===360){
     await page.locator("#tripListToolbar").evaluate(bar=>{bar.style.position="static"});
     await page.locator(".completedTripsList").screenshot({path:path.join(dir,"liste-trois-cartes-360.png"),animations:"disabled"});
     await page.locator("#tripListToolbar").evaluate(bar=>bar.style.removeProperty("position"));
     await page.locator(".upcomingTripsSection").screenshot({path:path.join(dir,"carte-a-venir-360.png"),animations:"disabled"});
    }
    const labels=()=>page.locator(".completedTripsList .journeyCountry").allTextContents();
    assert.deepEqual(await labels(),["Carnet parisien","Sénégal","Guinée"]);
    await page.locator("#tripListSort").click();
    await page.locator('[data-trip-sort="oldest"]').click();
    assert.deepEqual(await labels(),["Guinée","Sénégal","Carnet parisien"]);
    assert.equal(await page.evaluate(()=>localStorage.getItem("jyetais.trip.sort.v1")),"oldest");
    await page.locator("#tripListSort").click();
    await page.locator('[data-trip-sort="country"]').click();
    assert.deepEqual(await labels(),["Carnet parisien","Guinée","Sénégal"]);
    await page.reload({waitUntil:"load"});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    assert.deepEqual(await labels(),["Carnet parisien","Guinée","Sénégal"],"Country sort survives reload");
    await page.locator("#tripListSort").click();
    await page.locator('[data-trip-sort="recent"]').click();
    assert.deepEqual(await labels(),["Carnet parisien","Sénégal","Guinée"]);
    await page.locator("#tripListFilter").click();
    assert.equal(await page.locator("#filterPanel").getAttribute("aria-hidden"),"false");
    await page.locator("#filterCountry").selectOption("FR");
    assert.equal((await page.locator("#tripListSummary").innerText()).trim(),"1 voyage · 1 pays");
    assert.doesNotMatch(await page.locator("#app").innerText(),/payss/i);
    await page.locator("#resetFilters").click();
    await page.locator("#closeFilters").click();
    await page.evaluate(()=>{
     const bar=document.querySelector("#tripListToolbar");
     window.scrollTo(0,window.scrollY+bar.getBoundingClientRect().top+220);
    });
    await page.waitForTimeout(100);
    const sticky=await page.locator("#tripListToolbar").evaluate(el=>({top:el.getBoundingClientRect().top,position:getComputedStyle(el).position}));
    assert.equal(sticky.position,"sticky");
    assert.ok(sticky.top>=-1&&sticky.top<40,"Sticky toolbar should remain at top: "+JSON.stringify(sticky));
    // The pinned bar must cover the entire viewport edge-to-edge;
    // no trip card may peek through rounded edges.
    const stickyMask=await page.locator("#tripListToolbar").evaluate(bar=>{
      const r=bar.getBoundingClientRect(),style=getComputedStyle(bar);
      const onBar=x=>{
       const n=document.elementFromPoint(x,Math.round(Math.min(innerHeight-2,r.top+20)));
       return n===bar||bar.contains(n);
      };
      return {left:r.left,right:r.right,top:r.top,background:style.backgroundColor,
       radius:style.borderTopLeftRadius,leftCovered:onBar(1),rightCovered:onBar(innerWidth-2),
       scrollWidth:document.documentElement.scrollWidth};
    });
    assert.ok(Math.abs(stickyMask.left)<=1&&Math.abs(stickyMask.right-width)<=1,
      "Sticky bar must mask card edges across the viewport: "+JSON.stringify(stickyMask));
    // Opaque (no alpha) so moving cards never show through; the colour is the page ivory.
    assert.match(stickyMask.background,/^rgb\(\d+, \d+, \d+\)$/,"Sticky bar is fully opaque");
    assert.equal(stickyMask.radius,"0px","No rounded corners exposing moving cards");
    assert.ok(stickyMask.leftCovered&&stickyMask.rightCovered,"Cards cannot show beside the bar");
    assert.ok(stickyMask.scrollWidth<=width+1,"Full-width sticky bar causes no overflow");
    if(width===360)await page.screenshot({path:path.join(dir,"barre-collee-defilement-360.png"),animations:"disabled"});
    if(width===390)await page.screenshot({path:path.join(dir,"barre-collante-390.png"),animations:"disabled"});
    // The standard fixed + stays visible throughout scrolling once the
    // large Add button has passed; badges may scroll beneath it.
    const scrolling=await page.evaluate(async()=>{
      const add=document.querySelector("#addFloating"),large=document.querySelector("#add");
      const hit=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
      let checked=0,afterMain=0,hiddenAfterMain=0,badgeCrossings=0,firstCrossing=null;
      for(let y=0;y<=max+35;y+=35){
       scrollTo(0,Math.min(y,max));
       await new Promise(resolve=>requestAnimationFrame(resolve));
       checked++;
       if(large.getBoundingClientRect().bottom>=0)continue;
       afterMain++;
       const visible=!add.hidden&&getComputedStyle(add).display!=="none";
       if(!visible)hiddenAfterMain++;
       const rect=add.getBoundingClientRect();
       if([...document.querySelectorAll("#trips .journeyPhotoCount,#trips .journeyStatus")]
         .some(el=>hit(rect,el.getBoundingClientRect()))){
        badgeCrossings++;
        if(firstCrossing===null)firstCrossing=scrollY;
       }
      }
      return {checked,afterMain,hiddenAfterMain,badgeCrossings,firstCrossing};
    });
    assert.ok(scrolling.checked>=10&&scrolling.afterMain>0,
     "Sweep must cover the cards after the main Add button: "+JSON.stringify(scrolling));
    assert.equal(scrolling.hiddenAfterMain,0,
     "Floating + must remain visible throughout scrolling, even across badges: "+JSON.stringify(scrolling));
    // Explicit overlap regression: a synthetic photo pill passing underneath
    // must not trigger hiding or flashing of the floating +.
    const overlapProbe=await page.evaluate(()=>{
      const add=document.querySelector("#addFloating"),host=document.querySelector(".completedTripsList .journeyMedia");
      const pill=document.createElement("span");
      pill.className="journeyPhotoCount";pill.textContent="2 photos";
      const rect=add.getBoundingClientRect();
      // !important: override the grid badge layout for this artificial overlap probe.
      for(const [k,v] of Object.entries({position:"fixed",left:(rect.left+8)+"px",top:(rect.top+8)+"px",
       right:"auto",bottom:"auto"}))pill.style.setProperty(k,v,"important");
      host.append(pill);
      updateFloatingAdd();
      const intersects=(()=>{
       const p=pill.getBoundingClientRect(),f=add.getBoundingClientRect();
       return p.left<f.right&&p.right>f.left&&p.top<f.bottom&&p.bottom>f.top;
      })();
      const visibleDuring=!add.hidden&&getComputedStyle(add).display!=="none";
      pill.remove();
      updateFloatingAdd();
      return {intersects,visibleDuring,visibleAfter:!add.hidden};
    });
    assert.ok(overlapProbe.intersects&&overlapProbe.visibleDuring&&overlapProbe.visibleAfter,
     "Floating + stays visible when a photo pill crosses underneath: "+JSON.stringify(overlapProbe));
    if(width===390){
     await page.evaluate(async y=>{
      window.scrollTo(0,y);await new Promise(resolve=>requestAnimationFrame(resolve));
     },scrolling.firstCrossing??await page.evaluate(()=>
       Math.max(0,document.documentElement.scrollHeight-innerHeight-250)));
     await page.screenshot({path:path.join(dir,"pastilles-bouton-flottant-390.png"),animations:"disabled"});
    }
    // At the physical bottom of the document, the final fiche action must not
    // overlap the fixed 56px add shortcut, including its 16px bottom offset.
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(()=>{
     const add=document.querySelector("#addFloating");
     return !!add&&!add.hidden&&getComputedStyle(add).display!=="none";
    });
    const end=await page.evaluate(()=>{
     const last=document.querySelector(".completedTripsList .journeyTrip:last-child .journeyOpenLabel").getBoundingClientRect();
     const add=document.querySelector("#addFloating").getBoundingClientRect();
     const overlap=last.left<add.right&&last.right>add.left&&last.top<add.bottom&&last.bottom>add.top;
     return {last:{top:last.top,bottom:last.bottom,left:last.left,right:last.right},
      add:{top:add.top,bottom:add.bottom,left:add.left,right:add.right},
      overlap,viewport:innerHeight,scroll:scrollY};
    });
    assert.equal(end.overlap,false,"Floating + must never obscure the last Voir la fiche: "+JSON.stringify(end));
    assert.ok(end.last.top>=0&&end.last.bottom<=end.viewport,
      "Last fiche button must be fully visible at end of scroll: "+JSON.stringify(end));
    const before=privateRequests.length;
    await page.evaluate(()=>{
     showOfflineCopy({ownerId:"22222222-2222-4222-8222-222222222222",
      profile:{display_name:"Voyageuse Fictive",country_of_residence:"GN",home_city:"Conakry"},
      trips:window.__excursionFixture.rows.map(t=>({...t})),activities:[],updatedAt:"2026-11-16T12:00:00Z"});
    });
    assert.equal(await page.locator(".journeyPhotoCount").count(),0,"No photo badge offline");
    assert.equal(await page.locator(".completedTripsList .journeyTrip").first().locator(".journeyCountry").innerText(),
      "Carnet parisien","Offline title kept while all private photos are omitted");
    assert.equal(await page.locator('img[data-is-private="true"]').count(),0);
    assert.equal(await page.locator('.journeyBackdrop[src*="/storage/v1/object/sign/"]').count(),0);
    assert.equal(privateRequests.length,before,"Offline list never requests private images");
    assert.ok(await page.locator(".journeyBackdrop").count()>=1,"Offline fallback uses public illustration");
    assert.deepEqual(errors,[],"No JS page errors");
    console.log("PASS premium cards Android "+width+"px — visuals, sorting, sticky, photo privacy, offline");
   }finally{await context.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
