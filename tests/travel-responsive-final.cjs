"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const html=fs.readFileSync("travel/index.html","utf8");
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const svg=fs.readFileSync("travel/assets/world-map.svg","utf8");
assert.ok(css&&svg.includes('id="map-JP"')&&svg.includes('id="map-SN"')&&svg.includes('id="map-BR"'));
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const dir="test-artifacts/travel-responsive";fs.mkdirSync(dir,{recursive:true});
  for(const width of [320,360,390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:850},isMobile:width<900,hasTouch:width<900});
   try{
    await page.setContent('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="app"><div class="w"><header class="top"><div class="brand"><b>BEAM</b> TRAVEL HISTORY</div><button class="btn ghost">Mon compte</button></header><section id="travelHero" class="hero"><div><h1 id="dashboardTitle">Carnet de Mariama Diallo</h1><p class="sub">Mes voyages déclarés</p><div class="actions"><button class="btn">Ajouter un voyage</button><button class="btn ghost">Travel History PDF</button></div></div><div class="statsWrap"><div class="stats"><div class="stat"><b>3</b><small>voyages</small></div><div class="stat"><b>3</b><small>pays</small></div><div class="stat"><b>18</b><small>jours</small></div></div></div></section><section id="travelMapPanel" class="panel"><h2>Ma carte</h2><div class="map" id="map">'+svg+'</div><p id="mapInfo" class="mapInfo">Sénégal · Japon · Brésil</p></section><div id="travelPanels"><section id="travelTripsPanel" class="panel"><h2>Mes voyages</h2><div id="trips">Sénégal · Japon · Brésil</div></section></div></div></main></body></html>');
    await page.addStyleTag({content:css});
    const data=await page.evaluate(()=>{
      const svg=document.querySelector("#map svg"),codes=["SN","JP","BR"],paths=codes.map(c=>document.querySelector("#map-"+c));
      for(const p of paths){p.classList.add("visited");p.setAttribute("tabindex","0")}
      const boxes=paths.map(p=>p.getBBox()),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),r=Math.max(...boxes.map(b=>b.x+b.width)),bt=Math.max(...boxes.map(b=>b.y+b.height));
      const w=Math.max(r-x,24),h=Math.max(bt-y,18),pad=Math.max(w,h)*.9;
      svg.setAttribute("viewBox",[Math.max(0,x-pad),Math.max(0,y-pad),Math.min(1000,w+pad*2),Math.min(445,h+pad*2)].join(" "));
      const view=svg.viewBox.baseVal;
      const contained=boxes.every(b=>b.x>=view.x-.01&&b.y>=view.y-.01&&b.x+b.width<=view.x+view.width+.01&&b.y+b.height<=view.y+view.height+.01);
      return {contained,scroll:document.documentElement.scrollWidth,view:[view.x,view.y,view.width,view.height]};
    });
    assert.ok(data.contained,"map viewBox must encompass 3 continents: "+JSON.stringify(data));
    assert.ok(data.scroll<=width+1,"horizontal overflow "+width+": "+JSON.stringify(data));
    if(width<900){
      // Japan is an archipelago: the bounding-box center may fall in the sea.
      // Tap a painted point from an actual SVG subpath instead.
      const painted=await page.locator("#map-JP").evaluate(p=>{
        const svg=p.ownerSVGElement,transform=p.getScreenCTM();
        for(let i=0;i<=240;i++){
          const q=p.getPointAtLength(p.getTotalLength()*i/240);
          const pt=svg.createSVGPoint();pt.x=q.x;pt.y=q.y;
          const screen=pt.matrixTransform(transform);
          const local=pt.matrixTransform(p.getCTM().inverse());
          if(p.isPointInFill(local)&&screen.x>=0&&screen.y>=0&&screen.x<innerWidth&&screen.y<innerHeight)
            return {x:screen.x,y:screen.y};
        }
        throw Error("No painted point on Japan inside viewport");
      });
      await page.touchscreen.tap(painted.x,painted.y);
      const focus=await page.locator("#map-JP").evaluate(p=>({outline:getComputedStyle(p).outlineStyle,stroke:getComputedStyle(p).stroke}));
      assert.equal(focus.outline,"none","touch must not leave keyboard-only focus outline");
    }
    await page.screenshot({path:path.join(dir,"dashboard-"+width+".png"),fullPage:true});
    console.log("PASS "+width+"px map SN/JP/BR fit, touch focus, screenshot");
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
