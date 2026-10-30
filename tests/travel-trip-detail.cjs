'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const DETAIL=require('../travel/trip-detail.js');
const PDF=require('../travel/factual-pdf.js');

const html=fs.readFileSync('travel/index.html','utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline,'Travel app inline script exists');
new vm.Script(inline,{filename:'travel/index.html'});
new vm.Script(fs.readFileSync('travel/trip-detail.js','utf8'),{filename:'travel/trip-detail.js'});
assert.ok(html.includes('<script src="./trip-detail.js"></script>'),'Trip details helper must load before app');
assert.ok(html.includes('class="tripOpen"'),'Trip list must have clickable view cards');
assert.ok(html.includes('openTripDetail(b.dataset.id)'),'Tap must open a trip, not its editing form');
assert.ok(inline.includes('S.from("media").select("id,storage_path").eq("user_id",user.id).eq("trip_id",id)'),
  'Photos must be filtered by owner and trip');
assert.ok(inline.includes('S.from("activities").select("id,title,place,happened_on").eq("user_id",user.id).eq("trip_id",id)'),
  'Activities must be filtered by owner and trip');
assert.ok(inline.includes('createSignedUrl(row.storage_path,300)'),'Photos must be signed on demand');
assert.ok(inline.includes('DETAIL.validateActivity'),'Activity form must validate dates and title');
assert.ok(html.includes('@media print{#tripDetailModal{display:none!important}}'),
  'Private notes and photos must not appear in PDF/print');
assert.ok(!html.includes('class="editTrip"'), 'Trip cards should open consultation instead of editing');

assert.match(DETAIL.photos([]),/Aucune photo/);
assert.match(DETAIL.activities([]),/Aucune activité/);
const images=DETAIL.photos([
 {id:'1',url:'https://example.invalid/pic.webp?x=1&key=" onerror="alert(1)'},
 {id:'2',url:''}
]);
assert.ok(images.includes('&amp;key=&quot; onerror=&quot;alert(1)'),'URL is escaped in HTML attribute');
assert.ok(!images.includes('key=" onerror="'),'Untrusted URLs cannot create a new attribute');
assert.match(images,/Prévisualisation indisponible/);
const activities=DETAIL.activities([{
 id:'a" onclick="alert(1)',title:'<img src=x onerror=alert(1)>',
 place:'<script>evil</script>',happened_on:'2026-06-21'
}]);
assert.ok(!activities.includes('<script>'));
assert.ok(!activities.includes('<img src=x'));
assert.match(activities,/&lt;img/);
assert.match(activities,/&lt;script&gt;/);
assert.ok(!activities.includes('data-id="a" onclick='),'Activity id escaped');
assert.match(activities,/21 juin 2026/);

const trip={entry_date:'2026-06-20',exit_date:'2026-06-30'};
assert.deepEqual(DETAIL.validateActivity({title:'  Visite  ',place:'  Tour Eiffel ',happened_on:'2026-06-21'},trip),
 {value:{title:'Visite',place:'Tour Eiffel',happened_on:'2026-06-21',kind:'lieu'}});
assert.deepEqual(DETAIL.validateActivity({title:'Arrivée',place:'',happened_on:''},trip),
 {value:{title:'Arrivée',place:null,happened_on:null,kind:'lieu'}});
assert.match(DETAIL.validateActivity({title:' ',place:'',happened_on:''},trip).error,/titre/);
assert.match(DETAIL.validateActivity({title:'x'.repeat(161),place:'',happened_on:''},trip).error,/160/);
assert.match(DETAIL.validateActivity({title:'Visite',place:'x'.repeat(161),happened_on:''},trip).error,/160/);
assert.match(DETAIL.validateActivity({title:'Visite',place:'',happened_on:'2026-07-01'},trip).error,/comprise/);
assert.match(DETAIL.validateActivity({title:'Visite',place:'',happened_on:'2026-06-19'},trip).error,/comprise/);

// Test the real detail handlers using owned, mocked Supabase records.
function box(){
 const names=new Set();
 return {innerHTML:'',textContent:'',disabled:false,value:'',min:'',max:'',scrollTop:0,
  classList:{add:v=>names.add(v),remove:v=>names.delete(v),contains:v=>names.has(v)},
  focus(){context.document.activeElement=this},replaceChildren(){this.innerHTML=''},
  reset(){this.value='';this.didReset=true},
  querySelectorAll(){return []}
 };
}
const ids=['#modal','#tripDetailModal','#detailTitle','#detailIntro','#detailFacts','#detailNote',
 '#detailStatus','#detailActivityMessage','#detailActivityForm','#detailPhotos',
 '#detailActivities','#detailSheet','#detailClose','#detailEdit','#activityDate','#activitySave'];
const els=Object.fromEntries(ids.map(id=>[id,box()]));
const calls=[];
const tripRecord={id:'trip-1',country_code:'FR',cities:['Paris'],entry_date:'2026-06-20',
 exit_date:'2026-06-30',duration_days:11,note:'Souvenir privé',purpose:'tourisme',is_domestic:false};
const photoRows=[{id:'photo-1',storage_path:'owner/trip-1/photo-1.webp'}];
const actRows=[{id:'activity-1',title:'Visite du musée',place:'Paris',happened_on:'2026-06-22'}];
const S={
 from(table){
  const filters=[];
  const q={
   select(fields){calls.push([table,'select',fields]);return q},
   eq(k,v){filters.push([k,v]);return q},
   order(){calls.push([table,'filters',filters]);return Promise.resolve({data:table==='media'?photoRows:actRows,error:null})},
   insert:async payload=>{calls.push([table,'insert',payload]);return {error:null}},
   delete(){calls.push([table,'delete']);return {
     eq(){return this},
     select:async()=>({data:[{id:'activity-1'}],error:null})
   }}
  };
  return q;
 },
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://signed.invalid/private.webp'},error:null})})}
};
const context=vm.createContext({
 window:{BEAM_TRIP_DETAIL:DETAIL,BEAM_TRAVEL_PDF:PDF,confirm:()=>true},
 document:{activeElement:null},
 S,user:{id:'owner'},accountState:'active',trips:[tripRecord],
 $:id=>{assert.ok(els[id], 'Missing DOM stub '+id);return els[id]},
 countryName:code=>code==='FR'?'France':code,
 esc:v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
 openEditTrip:id=>calls.push(['edit',id]),console,FormData:class {get(name){
  return {title:'Visite guidée',place:'Paris',happened_on:'2026-06-23'}[name]
 }}
});
const start=inline.indexOf('// The consultation sheet is separate');
const end=inline.indexOf('const PHOTO=window.BEAM_PHOTO;',start);
assert.ok(start>=0&&end>start);
vm.runInContext(inline.slice(start,end),context);
async function main(){
 vm.runInContext('openTripDetail("trip-1")',context);
 await new Promise(setImmediate);
 assert.equal(els['#tripDetailModal'].classList.contains('open'),true);
 assert.equal(els['#detailTitle'].textContent,'Paris');
 assert.match(els['#detailFacts'].innerHTML,/11 jours/);
 assert.match(els['#detailPhotos'].innerHTML,/signed.invalid/);
 assert.match(els['#detailActivities'].innerHTML,/Visite du musée/);
 assert.equal(calls.filter(c=>c[0]==='media'&&c[1]==='filters')[0][2][0][1],'owner');
 assert.equal(calls.filter(c=>c[0]==='activities'&&c[1]==='filters')[0][2][1][1],'trip-1');
 await els['#detailActivityForm'].onsubmit({preventDefault(){},currentTarget:els['#detailActivityForm']});
 assert.ok(calls.some(c=>c[0]==='activities'&&c[1]==='insert'&&c[2].trip_id==='trip-1'));
 assert.equal(els['#activitySave'].disabled,false);
 els['#detailEdit'].onclick();
 assert.equal(els['#tripDetailModal'].classList.contains('open'),false);
 assert.ok(calls.some(c=>c[0]==='edit'&&c[1]==='trip-1'));
 console.log('BEAM trip detail PASS: owner filters, private images, escape, activity and navigation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
