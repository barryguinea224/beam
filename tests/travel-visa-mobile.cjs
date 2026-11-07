"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"travel/index.html"),"utf8");
const moduleSource=fs.readFileSync(path.join(root,"travel/visa-guide.js"),"utf8");
const style=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]+fs.readFileSync(path.join(root,"travel/account-settings.css"),"utf8");
const startHero=html.indexOf('<section id="travelHero"'),endHero=html.indexOf('<section id="accountStatusChecking"');
const startDetail=html.indexOf('<div id="tripDetailModal"'),endDetail=html.indexOf('<script src="https://cdn.jsdelivr.net',startDetail);
const startAccount=html.indexOf('<div id="accountOverlay"'),endAccount=html.indexOf('<div id="modal"',startAccount);
assert.ok(startAccount>0&&endAccount>startAccount,"read real BTH Mon compte drawer");
const accountFragment=html.slice(startAccount,endAccount).replace(/<\/div><\/main>\s*$/,"");
assert.ok(accountFragment.includes('id="myAccount"')&&accountFragment.includes('id="accountLinks"'),
 "account mobile test uses the real identity shortcut, not a fabricated fixture");
assert.ok(style&&startHero>0&&endHero>startHero&&startDetail>0&&endDetail>startDetail,
 "use markup and CSS from the actual BTH application, not a separate invented layout");
const markup='<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>'+style+'</style></head><body><main id="app"><div class="w">'+
 html.slice(startHero,endHero)+accountFragment+'</div></main>'+html.slice(startDetail,endDetail)+'</body></html>';
const fiches=["FR","CA","GB","TR","CN","MA"].map((code,index)=>({
 code_pays:code,slug:["france","canada","royaume-uni","turquie","chine","maroc"][index],
 destination:["France","Canada","Royaume-Uni","Turquie","Chine","Maroc"][index]
}));
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const out=path.join(root,"test-artifacts/visas-mobile");
 fs.mkdirSync(out,{recursive:true});
 try{
  for(const width of [320,360,375,390]){
   const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   try{
    const page=await context.newPage();
    await page.setContent(markup);
    const mainLink=page.locator("#dashboardVisaGuide");
    assert.equal(await mainLink.count(),1);
    assert.equal(await mainLink.innerText(),"Guide des visas");
    assert.equal(await mainLink.getAttribute("href"),"/visas/");
    assert.equal(await mainLink.getAttribute("target"),null,"dashboard uses same tab");
    let metrics=await page.evaluate(()=>{
     const a=document.querySelector("#dashboardVisaGuide").getBoundingClientRect();
     return {scroll:document.documentElement.scrollWidth,left:a.left,right:a.right};
    });
    assert.ok(metrics.scroll<=width+1&&metrics.left>=-1&&metrics.right<=width+1,
     "dashboard visa link must fit at "+width+"px: "+JSON.stringify(metrics));
    await page.screenshot({path:path.join(out,"bth-visas-dashboard-"+width+".png"),fullPage:true});

    await page.locator("#accountOverlay").evaluate(el=>{
     el.classList.add("accountOpen");
     el.setAttribute("aria-hidden","false");
    });
    const accountLink=page.locator("#accountLinks a[href=\"https://ididentite.com/\"]");
    assert.equal(await accountLink.count(),1);
    assert.equal(await accountLink.locator("span").first().innerText(),"Mes informations d'identité avec iD");
    assert.equal(await accountLink.getAttribute("href"),"https://ididentite.com/");
    assert.equal(await accountLink.getAttribute("rel"),"noopener noreferrer");
    assert.equal(await accountLink.getAttribute("target"),null,"same-tab identity link");
    assert.equal(await accountLink.getAttribute("onclick"),null);
    assert.ok(await accountLink.isVisible(),"identity link must be visible in Mon compte");
    const accountFit=await accountLink.evaluate(el=>{
     const a=el.getBoundingClientRect();
     return {left:a.left,right:a.right,scroll:document.documentElement.scrollWidth};
    });
    assert.ok(accountFit.left>=-1 && accountFit.right<=width+1 &&
     accountFit.scroll<=width+1,"account identity link must fit at "+width+"px: "+JSON.stringify(accountFit));
    await page.screenshot({path:path.join(out,"bth-identite-account-"+width+".png"),fullPage:true});
    await page.locator("#accountOverlay").evaluate(el=>{
     el.classList.remove("accountOpen");
     el.setAttribute("aria-hidden","true");
    });

    await page.addScriptTag({content:moduleSource});
    await page.evaluate(()=>document.querySelector("#tripDetailModal").classList.add("open"));
    assert.equal(await page.evaluate(async list=>{
     return await window.BEAM_VISA_GUIDE.showForCountry("FR",document.querySelector("#detailVisaGuide"),{
      fetchFn:async()=>({ok:true,json:async()=>list})
     });
    },fiches),true);
    const detail=page.locator("#detailVisaGuide");
    assert.equal(await detail.isVisible(),true);
    assert.equal(await detail.innerText(),"Préparer un nouveau visa ? Voir la fiche France");
    assert.equal(await detail.locator("a").getAttribute("href"),"/visas/france/");
    assert.equal(await detail.locator("a").getAttribute("target"),null);
    metrics=await page.evaluate(()=>{
     const a=document.querySelector("#detailVisaGuide").getBoundingClientRect();
     return {scroll:document.documentElement.scrollWidth,left:a.left,right:a.right};
    });
    assert.ok(metrics.scroll<=width+1&&metrics.left>=-1&&metrics.right<=width+1,
     "trip visa link must fit at "+width+"px: "+JSON.stringify(metrics));
    await page.screenshot({path:path.join(out,"bth-visas-france-"+width+".png"),fullPage:true});

    assert.equal(await page.evaluate(async list=>{
     return await window.BEAM_VISA_GUIDE.showForCountry("GN",document.querySelector("#detailVisaGuide"),{
      fetchFn:async()=>({ok:true,json:async()=>list})
     });
    },fiches),false);
    assert.equal(await detail.isVisible(),false,"unlisted country must display no recommendation");
    assert.equal(await page.evaluate(async()=>{
     return await window.BEAM_VISA_GUIDE.showForCountry("FR",document.querySelector("#detailVisaGuide"),{
      fetchFn:async()=>({ok:false,status:404})
     });
    }),false);
    assert.equal(await detail.isVisible(),false,"missing index must be silent");
    assert.equal(await page.evaluate(async()=>{
     return await window.BEAM_VISA_GUIDE.showForCountry("FR",document.querySelector("#detailVisaGuide"),{
      fetchFn:async()=>({ok:true,json:async()=>{throw Error("invalid JSON")}})
     });
    }),false);
    assert.equal(await detail.isVisible(),false,"invalid index must be silent");
    console.log("PASS BTH real markup dashboard and trip visa link "+width+"px");
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
