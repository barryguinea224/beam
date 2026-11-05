'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const original = fs.readFileSync(path.join(__dirname, '../travel/index.html'), 'utf8');
// Exercise real markup and CSS, without authentication, scripts or Supabase traffic.
const sheetCSS=fs.readFileSync(path.join(__dirname,'../travel/photo-sheet.css'),'utf8');
const html=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace('</head>','<style>'+sheetCSS+'</style></head>');
const thumb = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#b0c4b4"/></svg>'
);
const scenarios = [
  {
    name:'saved photos',
    cards: Array.from({length:2},()=>'<figure class="photoTile">'+
      '<button class="photoTap" type="button" aria-label="Actions photo">'+
      '<img src="'+thumb+'" alt="Souvenir fictif">'+
      '<span class="photoRoles"><span class="photoRole">★</span><span class="photoRole">✈</span></span></button>'+
      '<figcaption class="photoOneLine">Légende fictive</figcaption></figure>').join('')
  },
  {
    name:'pending photos and long names',
    cards: Array.from({length:2},(_,i)=>'<figure class="photoTile">'+
      '<button class="photoTap" type="button" aria-label="Photo en attente"><img src="'+thumb+'" alt="Photo fictive en attente"></button>'+
      '<figcaption class="photoOneLine">En attente · '+('nom-photo-portrait-'.repeat(4))+i+'.jpeg</figcaption></figure>').join('')
  }
];
const widths = [320, 360, 390];

async function main() {
  const browser = await chromium.launch({
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try {
    for(const width of widths) {
      const page = await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1,isMobile:true,hasTouch:true});
      try {
        await page.setContent(html,{waitUntil:'domcontentloaded'});
        await page.locator('#modal').evaluate(node=>node.classList.add('open'));
        for(const scenario of scenarios) {
          await page.locator('#photoGallery').evaluate((node,cards)=>{node.innerHTML=cards},scenario.cards);
          const layout = await page.evaluate(()=>{
            const sheet=document.querySelector('#tripForm');
            const sheetBox=sheet.getBoundingClientRect();
            const pad=getComputedStyle(sheet);
            const left=sheetBox.left+parseFloat(pad.paddingLeft);
            const right=sheetBox.right-parseFloat(pad.paddingRight);
            const selectors=['#photoField','#photos','#photoGallery','.photoTile','.photoTile img',
              '.photoTap','.photoRoles','.photoOneLine'];
            const nodes=selectors.flatMap(selector=>
              [...document.querySelectorAll(selector)]
                .filter(node=>node.closest('#photoField'))
                .map(node=>({selector,left:node.getBoundingClientRect().left,
                  right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width}))
            );
            return {
              width:innerWidth,bodyWidth:document.body.scrollWidth,
              documentWidth:document.documentElement.scrollWidth,
              modalLeft:sheetBox.left,modalRight:sheetBox.right,
              sheetScrollWidth:sheet.scrollWidth,sheetClientWidth:sheet.clientWidth,
              left,right,nodes
            };
          });
          assert.ok(layout.documentWidth<=width+1, 'Document horizontal scroll: '+JSON.stringify(layout));
          assert.ok(layout.modalLeft>=0 && layout.modalRight<=width+1,
            'Trip modal outside viewport: '+JSON.stringify(layout));
          assert.ok(layout.sheetScrollWidth<=layout.sheetClientWidth+1,
            'Trip modal contains horizontally overflowing content: '+JSON.stringify(layout));
          for(const node of layout.nodes) {
            assert.ok(node.left>=layout.left-1 && node.right<=layout.right+1,
              'Photo element clipped at '+width+'px: '+JSON.stringify({scenario:scenario.name,node,layout}));
          }
          assert.equal(layout.nodes.filter(node=>node.selector==='.photoTile').length,2);
          assert.equal(await page.locator('#photoGallery .photoTap').count(),2);
          assert.equal(await page.locator('#photoGallery .actions,#photoGallery .removePhoto').count(),0);
          console.log('PASS '+width+'px: '+scenario.name+' fits the trip modal');
        }
      } finally {await page.close()}
    }
  } finally {await browser.close()}
}

main().catch(error=>{console.error(error);process.exitCode=1});
