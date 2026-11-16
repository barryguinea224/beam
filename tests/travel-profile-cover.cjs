"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const {serve,fictionalSupabase}=require("./travel-day-excursions-mobile.cjs");
const COVER=require("../travel/profile-cover.js");
const owner="22222222-2222-4222-8222-222222222222",other="99999999-9999-4999-8999-999999999999";
const trip=(id,code,end)=>({id,country_code:code,entry_date:"2025-01-01",exit_date:end,deleting:false});
const old=trip("old","FR","2025-02-01"),recent=trip("new","SN","2025-11-01");
const photo=(id,trip_id,user_id=owner,favorite=false)=>({id,trip_id,user_id,is_favorite:favorite,storage_path:user_id+"/"+trip_id+"/"+id+".webp",created_at:"2025-02-01"});
const rows=[photo("old-fav","old",owner,true),photo("recent-first","new"),photo("unowned","new",other,true)];
assert.equal(COVER.decide({cover_media_id:"recent-first"},[old,recent],rows,"2026-11-14",owner).source,"manual");
assert.equal(COVER.decide({cover_media_id:"unowned"},[old,recent],rows,"2026-11-14",owner).photo.id,"recent-first");
assert.equal(COVER.decide({},[old,recent],rows,"2026-11-14",owner).photo.id,"recent-first","Newest completed trip wins");
assert.equal(COVER.decide({},[old],rows,"2026-11-14",owner).source,"favorite");
assert.equal(COVER.decide({},[recent,old],[photo("old-fav","old",owner,true)],"2026-11-14",owner).source,"country","Do not substitute an older trip photo for latest country art");
assert.equal(COVER.decide({},[recent],[], "2026-11-14",owner).source,"country");
assert.equal(COVER.decide({},[],[], "2026-11-14",owner).source,"solid");
assert.equal(COVER.safeUrl("https://attacker.invalid/fake","https://fixture.invalid"),"");
const html=fs.readFileSync("travel/index.html","utf8"),sw=fs.readFileSync("travel/sw.js","utf8");
assert.match(html,/id="coverPickerOpen"/);
assert.match(html,/id="photoProfileCover"/);
assert.match(html,/id="coverAuto"/);
assert.match(sw,/jyetais-v57-read-mode-flag/);
assert.doesNotMatch(sw,/caches\.put\(/);
const dir=path.resolve("test-artifacts/cover-profile");
fs.mkdirSync(dir,{recursive:true});
const patch=String.raw`
(function(){
 const initial=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{
  const client=initial(...args),base=client.from.bind(client);
  const ui=window.__coverFixture={profile:{display_name:"Voyageuse Fictive",country_of_residence:"GN",
   access_until:location.search.includes("readonly=1")?"2020-01-01":"2099-12-31",deleting:false,avatar_id:null,cover_media_id:null},
   rows:[{id:"picture-senegal",user_id:"22222222-2222-4222-8222-222222222222",trip_id:"completed-sn",
    storage_path:"22222222-2222-4222-8222-222222222222/completed-sn/fixture.webp",
    created_at:"2025-07-01",is_favorite:true}]};
  window.__excursionFixture.rows.push({id:"completed-sn",country_code:"SN",cities:["Dakar"],entry_date:"2025-06-01",
    exit_date:"2025-06-10",duration_days:10,purpose:"tourisme",deleting:false});
  client.from=table=>{
   if(table!=="media"&&table!=="profiles")return base(table);
   let where=[],op="select",patchData=null;
   const result=()=>{
    if(table==="profiles"){
      if(op==="update"){Object.assign(ui.profile,patchData);return {data:{...ui.profile},error:null}}
      return {data:{...ui.profile},error:null};
    }
    const filtered=ui.rows.filter(row=>where.every(([k,v])=>row[k]===v));
    return {data:filtered,error:null};
   };
   const q={select(){return q},eq(k,v){where.push([k,v]);return q},order(){return q},range(){return q},
     update(v){op="update";patchData=v;return q},single(){return Promise.resolve(result())},
     maybeSingle(){const r=result();return Promise.resolve({data:r.data[0]||null,error:null})},
     then(ok,fail){return Promise.resolve(result()).then(ok,fail)}};
   return q;
  };
  client.storage.from=()=>({createSignedUrl:async(path)=>({data:{signedUrl:"https://fixture.invalid/storage/v1/object/sign/media/"+encodeURIComponent(path)+"?token=fake"},error:null})});
  return client;
 };
})();`;
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect width="1600" height="600" fill="#519384"/><circle cx="800" cy="250" r="170" fill="#f0b66b"/></svg>';
async function main(){
 const host=serve();await new Promise(ok=>host.listen(0,"127.0.0.1",ok));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const width of [320,360,390]){
   const ctx=await browser.newContext({viewport:{width,height:820},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:"block"});
   const page=await ctx.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/*",route=>{
    const u=new URL(route.request().url());
    if(u.hostname==="cdn.jsdelivr.net")
     return route.fulfill({status:200,contentType:"application/javascript",body:"("+fictionalSupabase.toString()+")();"+patch});
    if(u.hostname==="fixture.invalid"&&u.pathname.startsWith("/storage/v1/object/sign/media/"))
     return route.fulfill({status:200,contentType:"image/svg+xml",headers:{"cache-control":"no-store"},body:svg});
    if(u.hostname==="127.0.0.1")return route.continue();
    return route.abort();
   });
   try{
    await page.goto("http://127.0.0.1:"+host.address().port+"/travel/",{waitUntil:"load",timeout:30000});
    await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
    await page.waitForFunction(()=>document.querySelector("#profileCover")?.dataset.source==="favorite",null,{timeout:15000});
    await page.locator("#profileCoverImage").waitFor({state:"visible"});
    await page.evaluate(()=>window.scrollTo(0,0));
    const measurements=await page.evaluate(()=>{
      const cover=document.querySelector("#profileCover").getBoundingClientRect();
      const avatar=document.querySelector("#travelerAvatar").getBoundingClientRect();
      return {coverTop:cover.top,coverWidth:cover.width,coverHeight:cover.height,avatarTop:avatar.top,coverBottom:cover.bottom,
       overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.equal(measurements.coverTop,0,"Cover must start at viewport top at width "+width);
    assert.ok(measurements.coverHeight<=180&&measurements.coverHeight>=100,JSON.stringify(measurements));
    assert.ok(measurements.avatarTop<measurements.coverBottom&&measurements.overflow<=1,JSON.stringify(measurements));
    if(width===360)await page.screenshot({path:path.join(dir,"accueil-couverture-360.png"),animations:"disabled"});
    if(width===360){
      const countries=[["FR","France","Paris"],["MA","Maroc","Marrakech"],["GN","Guinée","Labé"],["SA","Arabie saoudite","Riyad"],["TR","Turquie","Istanbul"]];
      for(const [countryCode,name,city] of countries){
       await page.evaluate(({countryCode,name,city})=>{
        document.querySelector("#finishFixtureCard")?.remove();
        const template=document.createElement("template");
        template.innerHTML=window.BEAM_VISUAL_CARDS.markup({
         id:"70000000-0000-4000-8000-000000000001",country_code:countryCode,cities:[city],
         entry_date:"2025-09-02",exit_date:"2025-09-04",duration_days:3,purpose:"tourisme",
         is_domestic:false,deleting:false},""+name,"Tourisme","2 au 4 sept. 2025");
        const card=template.content.firstElementChild;card.id="finishFixtureCard";
        document.querySelector("#trips").prepend(card);
       },{countryCode,name,city});
       const card=page.locator("#finishFixtureCard");
       await card.scrollIntoViewIfNeeded();
       const image=card.locator(".journeyBackdrop");
       await image.evaluate(img=>img.decode());
       assert.equal(await image.evaluate(img=>img.naturalWidth),1600,"Valid 1600px landscape "+countryCode);
       await page.screenshot({path:path.join(dir,"carte-"+countryCode.toLowerCase()+"-360.png"),animations:"disabled"});
      }
      await page.evaluate(()=>document.querySelector("#finishFixtureCard")?.remove());
      await page.evaluate(()=>window.scrollTo(0,0));
    }
    await page.locator("#openAccount").click();
    await page.locator("#coverPickerOpen").click();
    await page.locator("#coverPickerGrid .coverOption").first().waitFor();
    if(width===360)await page.screenshot({path:path.join(dir,"parametres-choix-couverture-360.png"),animations:"disabled"});
    await page.locator("#coverPickerGrid .coverOption").first().click();
    await page.waitForFunction(()=>window.__coverFixture.profile.cover_media_id==="picture-senegal");
    await page.locator("#coverAuto").click();
    await page.waitForFunction(()=>window.__coverFixture.profile.cover_media_id===null);
    await page.locator("#closeAccount").click();
    await page.locator("#trips .journeyTrip").filter({hasText:"Sénégal"}).first().scrollIntoViewIfNeeded();
    if(width===360)await page.screenshot({path:path.join(dir,"carte-senegal-360.png"),animations:"disabled"});
    if(width===360){
      await page.goto("http://127.0.0.1:"+host.address().port+"/travel/?readonly=1",{waitUntil:"load"});
      await page.waitForFunction(()=>document.querySelector("#dashboardTitle")?.textContent==="Voyageuse Fictive");
      await page.locator("#openAccount").click();
      assert.equal(await page.locator("#coverPickerOpen").isDisabled(),true,"Read-only cannot select a cover");
      assert.equal(await page.locator("#coverAuto").isDisabled(),true,"Read-only cannot reset cover");
      assert.equal(await page.locator("#coverReadonly").isVisible(),true);
    }
    assert.deepEqual(errors,[],"Console errors "+width);
    console.log("PASS profile cover Android "+width+"px, fictional signed photo, settings choice/reset and overflow");
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(ok=>host.close(ok))}
}
main().catch(e=>{console.error(e);process.exitCode=1});