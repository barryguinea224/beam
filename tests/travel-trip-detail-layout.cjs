'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const DETAIL=require('../travel/trip-detail.js');

const original=fs.readFileSync('travel/index.html','utf8');
const html=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const sample='data:image/svg+xml,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="450" height="700"><rect width="450" height="700" fill="#b3c2b4"/></svg>'
);
async function run(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [320,360,390,720]){
   const page=await browser.newPage({viewport:{width,height:780},isMobile:true,hasTouch:true});
   try{
    await page.setContent(html,{waitUntil:'domcontentloaded'});
    const images=DETAIL.photos(Array.from({length:3},(_,i)=>({id:String(i),url:sample})));
    const activities=DETAIL.activities([
     {id:'a',title:'Musée et promenade',place:'Centre-ville',happened_on:'2026-06-21'},
     {id:'b',title:'Un titre de souvenir '.repeat(10),place:'',happened_on:null}
    ]);
    await page.evaluate(({images,activities})=>{
     document.querySelector('#tripDetailModal').classList.add('open');
     document.querySelector('#detailTitle').textContent='Paris';
     document.querySelector('#detailFacts').innerHTML=Array.from({length:6},(_,i)=>
       '<div class="detailFact"><dt>Étiquette</dt><dd>Champ '+i+' avec un texte long et explicatif</dd></div>'
     ).join('');
     document.querySelector('#detailPhotos').innerHTML=images;
     document.querySelector('#detailActivities').innerHTML=activities;
     document.querySelector('#detailNote').textContent='Souvenir très personnel '.repeat(12);
    },{images,activities});
    const measurement=await page.evaluate(()=>{
     const sheet=document.querySelector('#detailSheet');
     const outer=sheet.getBoundingClientRect();
     const pad=getComputedStyle(sheet);
     const left=outer.left+parseFloat(pad.paddingLeft);
     const right=outer.right-parseFloat(pad.paddingRight);
     const elements=['.detailFacts','.detailFact','.detailGallery','.detailPhoto','.detailPhoto img',
       '.detailActivity','.detailActivityText','.detailActivityForm','.detailActivityForm input']
       .flatMap(selector=>[...sheet.querySelectorAll(selector)].map(node=>{
        const rect=node.getBoundingClientRect();
        return {selector,left:rect.left,right:rect.right}
       }));
     return {documentWidth:document.documentElement.scrollWidth,innerWidth,
       sheetLeft:outer.left,sheetRight:outer.right,
       sheetScroll:sheet.scrollWidth,sheetClient:sheet.clientWidth,left,right,elements};
    });
    assert.ok(measurement.documentWidth<=width+1,'Document overflow: '+JSON.stringify(measurement));
    assert.ok(measurement.sheetLeft>=0&&measurement.sheetRight<=width+1,'Sheet clips: '+JSON.stringify(measurement));
    assert.ok(measurement.sheetScroll<=measurement.sheetClient+1,'Sheet content overflow: '+JSON.stringify(measurement));
    for(const el of measurement.elements){
     assert.ok(el.left>=measurement.left-1&&el.right<=measurement.right+1,
       'Element spills at '+width+'px: '+JSON.stringify({el,measurement}));
    }
    console.log('BEAM detail PASS: '+width+'px layout with private photos and activities');
   }finally{await page.close()}
  }
 }finally{await browser.close()}
}
run().catch(err=>{console.error(err);process.exitCode=1});
