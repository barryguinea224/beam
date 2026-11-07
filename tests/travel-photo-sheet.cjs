'use strict';
// Photo-action integration contract on actual index.html / trip-detail.js, no client data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {chromium}=require('playwright');
const DETAIL=require('../travel/trip-detail.js');
const html=fs.readFileSync('travel/index.html','utf8');
const css=fs.readFileSync('travel/photo-sheet.css','utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline);new vm.Script(inline,{filename:'travel/index.html'});
assert.match(html,/id="photoActionOverlay"/);
assert.match(html,/id="photoNoteInput" maxlength="500"/);
assert.match(inline,/function openPhotoActions\(/);
assert.match(inline,/photoActionOverlay"\)\.onkeydown/);
assert.match(inline,/e\.key==="Escape"/);
assert.match(inline,/if\(e\.target===\$\("#photoActionOverlay"\)\)closePhotoActions/);
assert.match(inline,/\.update\(\{caption:value\|\|null\}\)/);
assert.match(inline,/\.eq\("id",state\.row\.id\)\.eq\("trip_id",state\.tripId\)\.eq\("user_id",user\.id\)/);
assert.match(inline,/action:"delete_photo",media_id:state\.row\.id/);
assert.match(inline,/id,storage_path,caption/);
assert.match(inline,/id,storage_path,created_at,caption/);
const handler=inline.slice(inline.indexOf('$("#photoGallery").onclick='),inline.indexOf('async function uploadPhotos('));
assert.doesNotMatch(handler,/window\.confirm|classList\.contains\("removePhoto"\)/);
const print=inline.slice(inline.indexOf('$("#printJournal").onclick'),inline.indexOf('$("#pdf").onclick'));
for(const field of ['airline','hotel','airline_media_id','hotel_media_id'])
 assert.ok(print.includes(field),'print query preserves '+field);
assert.match(print,/\.select\("id,storage_path,is_favorite,caption"\)/);
assert.match(print,/photoCaptions\.push\(DETAIL\.captionValue\(row\.caption\)\)/);
const sw=fs.readFileSync('travel/sw.js','utf8');
assert.match(sw,/jyetais-v37/);
assert.match(sw,/"\.\/photo-sheet\.css"/);
const malicious='<img src=x onerror=alert(1)> Bonjour';
const images=DETAIL.photos([
  {id:'safe',url:'https://example.invalid/owned.webp',caption:malicious}
],{airline:true,hotel:true,coverMediaId:'safe',airlineMediaId:'safe',hotelMediaId:'safe'});
assert.ok(images.includes('class="photoTap"'));
for(const symbol of ['★','✈','🏨'])assert.ok(images.includes(symbol));
assert.ok(!images.includes('📝'),'a note shows as its one-line caption, never as a badge');
assert.ok(images.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!images.includes(malicious),'caption may not become HTML');
assert.ok(!images.includes('detailCaptionToggle')&&!images.includes('stayPhotoChoice'));
assert.ok(!images.includes('carte d’embarquement'),'no advice text under the photo grid');
const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('</head>','<style>'+css+'</style></head>');
const sample='data:image/svg+xml,'+encodeURIComponent(
 '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="450"><rect width="360" height="450" fill="#b5d5c1"/><circle cx="180" cy="180" r="100" fill="#498769"/></svg>');
(async()=>{
 fs.mkdirSync('test-artifacts/photo-sheet-android',{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [320,360,390]){
   const page=await browser.newPage({viewport:{width,height:720},isMobile:true,hasTouch:true});
   try{
    await page.setContent(clean,{waitUntil:'domcontentloaded'});
    await page.evaluate(({sample})=>{
      const img=window.BEAM_TRIP_DETAIL; // In this static fixture the helper is not loaded.
      document.querySelector('#tripDetailModal').classList.add('open');
      const gallery=document.querySelector('#detailPhotos');
      gallery.innerHTML=Array.from({length:4},(_,i)=>'<figure class="detailPhoto">'+
       '<button type="button" class="photoTap" aria-label="Actions photo"><img alt="Photo fictive" src="'+sample+'">'+
       '<span class="photoRoles"><span class="photoRole">★</span><span class="photoRole">✈</span></span></button>'+
       '<figcaption class="photoOneLine">Note fictive '+i+' · Souvenir</figcaption></figure>').join('');
      document.querySelector('#photoActionImage').src=sample;
      document.querySelector('#photoActionCaption').textContent='Note fictive';
      document.querySelector('#photoActionOverlay').classList.add('open');
      document.querySelector('#photoActionOverlay').setAttribute('aria-hidden','false');
    },{sample});
    // Android captures use only synthetic SVGs and invented captions, never accounts.
    await page.locator('#photoActionOverlay').evaluate(node=>node.classList.remove('open'));
    await page.screenshot({path:'test-artifacts/photo-sheet-android/grille-'+width+'.png'});
    await page.locator('#photoActionOverlay').evaluate(node=>node.classList.add('open'));
    await page.screenshot({path:'test-artifacts/photo-sheet-android/menu-'+width+'.png'});
    const m=await page.evaluate(()=>{
      const dialog=document.querySelector('#photoActionDialog');
      const overlay=document.querySelector('#photoActionOverlay');
      const tiles=[...document.querySelectorAll('#detailPhotos .detailPhoto')];
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}};
      return {screen:innerWidth,scroll:document.documentElement.scrollWidth,dialog:rect(dialog),
        dialogScroll:dialog.scrollWidth,dialogClient:dialog.clientWidth,overlay:rect(overlay),
        tiles:tiles.map(rect),tileButtons:[...document.querySelectorAll('#detailPhotos button')].map(rect),
        buttons:[...dialog.querySelectorAll('button')].filter(x=>!x.closest('.hidden'))
          .map(x=>({id:x.id,...rect(x)}))};
    });
    assert.ok(m.scroll<=width+1,'horizontal overflow at '+width+': '+JSON.stringify(m));
    assert.equal(m.tiles.length,4);
    assert.equal(m.tileButtons.length,4,'only image buttons in grid');
    assert.ok(m.dialog.left>=-1&&m.dialog.right<=width+1,'sheet horizontal overflow');
    assert.ok(m.dialogScroll<=m.dialogClient+1,'sheet internal overflow');
    for(const b of m.buttons)assert.ok(b.height>=44,'tap target too small '+b.id);
    const last=page.locator('#photoDelete');
    await last.scrollIntoViewIfNeeded();
    assert.ok(await last.isVisible(),'delete action reachable at '+width);
    console.log('PASS photo-sheet Android '+width+'px: image-only grid, badges, captions, accessible sheet');
   }finally{await page.close()}
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
