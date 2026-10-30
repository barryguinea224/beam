'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const PHOTO = require('../travel/photo-utils.js');

const html = fs.readFileSync('travel/index.html', 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'Expected inline app script');
new vm.Script(source, {filename: 'travel/index.html'});
const start = source.indexOf('const PHOTO=window.BEAM_PHOTO;');
const end = source.indexOf('let deletingAccount=false;', start);
assert.ok(start >= 0 && end > start, 'Photo logic not found');
const photoCode = source.slice(start, end);
assert.ok(photoCode.includes('const selected=pendingPhotos.slice()'),
  'Save must read queued files, not the final input selection');

const jpeg = new Uint8Array([255,216,255,225,0,16,69,120,105,102,0,0]);
function fake(name) {
  const blob = new Blob([jpeg], {type:'image/jpeg'});
  return {name, size:blob.size, type:blob.type, slice:(a,b)=>blob.slice(a,b)};
}
function element(id) {
  const classes = new Set(id === '#modal' ? ['open'] : []);
  return {
    disabled:false, value:'', textContent:'', innerHTML:'', files:[],
    classList:{
      add(name){classes.add(name)},
      remove(name){classes.delete(name)},
      contains(name){return classes.has(name)}
    },
    replaceChildren(){this.innerHTML=''},
    reset(){this.didReset=true}
  };
}
function harness() {
  const ids=['#photos','#photoGallery','#photoUsage','#photoMessage','#saveTrip',
    '#modal','#tripForm','#tripMsg','#tripTitle','#appMsg','#close'];
  const els=Object.fromEntries(ids.map(id=>[id,element(id)]));
  const records=[],uploads=[],revoked=[];
  let created=0,uploadCount=0,failAt=0,serial=0,confirmAnswer=true;
  const confirmMessages=[];
  const storage={
    upload:async (path,blob,options)=>{
      uploads.push({path,blob,options});
      uploadCount++;
      return {error:uploadCount===failAt?new Error('network'):null};
    },
    remove:async()=>({error:null}),
    createSignedUrl:async path=>({data:{signedUrl:'https://preview.invalid/'+path},error:null})
  };
  const tripData={
    id:'trip-1',country_code:'FR',cities:['Paris'],
    entry_date:'2026-06-20',exit_date:'2026-06-30',duration_days:11,purpose:'tourisme'
  };
  const result={select(){return {single:async()=>({data:tripData,error:null})}}};
  const db={
    storage:{from:()=>storage},
    from(table){
      if(table==='trips')return {
        insert:()=>result,
        update:()=>({eq:()=>result})
      };
      if(table==='media')return {
        insert:async row=>{records.push(row);return {error:null}},
        select:()=>({
          eq(){return this},
          order:async()=>({data:records.map(row=>({id:row.id,storage_path:row.storage_path,created_at:'2026-10-30'})),error:null})
        })
      };
      throw new Error('Unknown table '+table);
    }
  };
  const convertedPhoto={convert:async()=>({
    blob:new Blob(['reencoded pixels'],{type:'image/webp'}),width:800,height:1200
  })};
  const context=vm.createContext({
    window:{BEAM_PHOTO:{...PHOTO,...convertedPhoto},confirm:message=>{confirmMessages.push(message);return confirmAnswer}},
    URL:{
      createObjectURL:()=>('blob:preview-'+(++created)),
      revokeObjectURL:url=>revoked.push(url)
    },
    crypto:{randomUUID:()=>('photo-'+(++serial))},
    S:db,user:{id:'test-user'},accountState:'active',editingTripId:null,
    esc:s=>String(s),$ :id=>{assert.ok(els[id], 'Unexpected selector '+id);return els[id]},
    FormData:class {get(name){
      return {
        country_code:'FR',cities:'Paris',entry_date:'2026-06-20',
        exit_date:'2026-06-30',purpose:'tourisme',note:'',is_domestic:'false'
      }[name];
    }},
    render:()=>{},load:async()=>{},trips:[],
    setTimeout:()=>{},console
  });
  vm.runInContext(photoCode,context);
  vm.runInContext('mediaReady=true;',context);
  async function select(files) {
    els['#photos'].files=files;
    els['#photos'].value='chosen';
    await els['#photos'].onchange();
    assert.equal(els['#photos'].value,'','The input must be reset after each selection');
  }
  async function save() {
    await els['#tripForm'].onsubmit({preventDefault(){},currentTarget:els['#tripForm']});
  }
  function queued() {
    return vm.runInContext('pendingPhotos.map(entry=>entry.file.name)',context);
  }
  function close() {return els['#close'].onclick()}
  function setConfirm(answer){confirmAnswer=answer}
  function remove(id) {
    return els['#photoGallery'].onclick({
      target:{closest:()=>({dataset:{pendingId:id}})}
    });
  }
  return {els,records,uploads,revoked,context,select,save,queued,remove,close,setConfirm,confirmMessages,
    failAt:n=>{failAt=n},uploadCount:()=>uploadCount};
}
async function main() {
  // The actual browser onchange handler is invoked twice, never as one multi-file selection.
  const first=harness();
  await first.select([fake('portrait.jpg')]);
  await first.select([fake('gps.jpg')]);
  assert.deepEqual(Array.from(first.queued()),['portrait.jpg','gps.jpg']);
  assert.match(first.els['#photoUsage'].textContent,/0 enregistrées \+ 2 en attente \/ 10/);
  assert.match(first.els['#photoGallery'].innerHTML,/portrait\.jpg/);
  assert.match(first.els['#photoGallery'].innerHTML,/gps\.jpg/);
  await first.save();
  assert.equal(first.uploads.length,2,'Two successive selections must upload two photos');
  assert.equal(first.records.length,2,'Both uploads must have database records');
  assert.deepEqual(Array.from(first.queued()),[],'Successful files must leave queue');
  assert.equal(first.revoked.length,2,'Object URLs must be released');
  assert.equal(first.els['#modal'].classList.contains('open'),false);

  // Removing a pending thumbnail must not make a server request.
  const second=harness();
  await second.select([fake('remove-me.jpg')]);
  await second.select([fake('keep-me.jpg')]);
  await second.remove('1');
  assert.deepEqual(Array.from(second.queued()),['keep-me.jpg']);
  assert.equal(second.revoked.length,1);
  await second.save();
  assert.equal(second.uploads.length,1);
  assert.equal(second.records.length,1);

  // Closing must warn when there are unsaved photos, retain the queue on cancel,
  // and release the previews only after the traveler confirms.
  const closing=harness();
  await closing.select([fake('keep-a.jpg')]);
  await closing.select([fake('keep-b.jpg')]);
  closing.setConfirm(false);
  closing.close();
  assert.equal(closing.confirmMessages.length,1);
  assert.match(closing.confirmMessages[0],/2 photos pas encore enregistrées\. Fermer sans les enregistrer \?/);
  assert.equal(closing.els['#modal'].classList.contains('open'),true);
  assert.deepEqual(Array.from(closing.queued()),['keep-a.jpg','keep-b.jpg']);
  assert.equal(closing.revoked.length,0,'Cancel must not release previews');
  closing.setConfirm(true);
  closing.close();
  assert.equal(closing.els['#modal'].classList.contains('open'),false);
  assert.deepEqual(Array.from(closing.queued()),[]);
  assert.equal(closing.revoked.length,2,'Confirm discards and releases previews');
  const emptyClose=harness();
  emptyClose.close();
  assert.equal(emptyClose.confirmMessages.length,0,'Closing with no pending photos must not prompt');
  assert.equal(emptyClose.els['#modal'].classList.contains('open'),false);
  const singleClose=harness();
  await singleClose.select([fake('one.jpg')]);
  singleClose.setConfirm(false);
  singleClose.close();
  assert.match(singleClose.confirmMessages[0],/^1 photo pas encore enregistrée\./);

  // The cap includes existing + pending + new, preserving previous choices on rejection.
  const cap=harness();
  vm.runInContext('existingMedia=Array.from({length:9},(_,i)=>({id:String(i),url:""}));',cap.context);
  await cap.select([fake('tenth.jpg')]);
  await cap.select([fake('eleventh.jpg')]);
  assert.deepEqual(Array.from(cap.queued()),['tenth.jpg']);
  assert.match(cap.els['#photoMessage'].textContent,/10 photos maximum/);
  assert.match(cap.els['#photoUsage'].textContent,/9 enregistrées \+ 1 en attente \/ 10/);

  // A failed second upload keeps only that second item, so the retry cannot duplicate first.
  const partial=harness();
  partial.failAt(2);
  await partial.select([fake('done.jpg')]);
  await partial.select([fake('retry.jpg')]);
  await partial.save();
  assert.equal(partial.records.length,1);
  assert.deepEqual(Array.from(partial.queued()),['retry.jpg']);
  assert.match(partial.els['#tripMsg'].textContent,/1 photo reste en attente/);
  assert.equal(partial.els['#modal'].classList.contains('open'),true);
  await partial.save();
  assert.equal(partial.records.length,2);
  assert.equal(partial.uploads.length,3,'One failed upload was retried, not the successful photo');
  assert.deepEqual(Array.from(partial.queued()),[]);
  console.log('BEAM photo queue PASS: successive pickers, thumbnails, remove, cap, partial failure and retry');
}
main().catch(err=>{console.error(err);process.exitCode=1});
