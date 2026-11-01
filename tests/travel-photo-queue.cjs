'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const PHOTO = require('../travel/photo-utils.js');
const COUNTRIES = require('../travel/countries.js');
const {uploadOne} = require('../travel/photo-upload.js');

const html = fs.readFileSync('travel/index.html', 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const PHOTO=window.BEAM_PHOTO;'));
assert.ok(source, 'Expected inline app script');
new vm.Script(source, {filename: 'travel/index.html'});
const start = source.indexOf('const PHOTO=window.BEAM_PHOTO;');
const end = source.indexOf('let deletingAccount=false;', start);
assert.ok(start >= 0 && end > start, 'Photo logic not found');
const photoCode = source.slice(start, end);
assert.ok(photoCode.includes('const selected=pendingPhotos.slice()'),
  'Save must read queued files, not the final input selection');
assert.ok(photoCode.includes('BEAM_PHOTO_UPLOAD.uploadOne'),
  'The live queue must use the row-first upload helper');

const jpeg = new Uint8Array([255,216,255,225,0,16,69,120,105,102,0,0]);
function fake(name, mode=null) {
  const blob = new Blob([jpeg], {type:'image/jpeg'});
  let readable=true;
  const file={name, size:blob.size, type:blob.type, slice:(a,b)=>{
    if(!readable||mode==='NotFoundError'||mode==='NotReadableError'){
      const error=new Error('A requested file or directory could not be found at the time an operation was processed');
      error.name=mode||'NotFoundError';
      throw error;
    }
    return blob.slice(a,b);
  }};
  file.revoke=()=>{readable=false};
  return file;
}
function element(id) {
  const classes = new Set(id === '#modal' ? ['open'] : []);
  return {
    disabled:false, value:'', textContent:'', innerHTML:'', files:[],
    classList:{
      add(name){classes.add(name)},
      remove(name){classes.delete(name)},
      toggle(name,force){const yes=force===undefined?!classes.has(name):!!force;if(yes)classes.add(name);else classes.delete(name);return yes},
      contains(name){return classes.has(name)}
    },
    replaceChildren(){this.innerHTML=''},
    reset(){this.didReset=true}
  };
}
function harness() {
  const ids=['#photos','#photoGallery','#photoUsage','#photoLoadStatus','#photoRetry','#photoMessage','#saveTrip',
    '#modal','#tripForm','#tripMsg','#tripTitle','#appMsg','#close'];
  const els=Object.fromEntries(ids.map(id=>[id,element(id)]));
  const records=[],uploads=[],revoked=[],calls=[];
  let created=0,uploadCount=0,failAt=0,serial=0,confirmAnswer=true,failConversionName=null;
  const confirmMessages=[];
  const storage={
    upload:async (path,blob,options)=>{
      uploads.push({path,blob,options});
      calls.push(['upload',path]);
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
    functions:{async invoke(name,{body}){
      assert.equal(name,'travel-delete');
      assert.equal(body.action,'delete_photo');
      calls.push(['cleanup',body.media_id]);
      const index=records.findIndex(row=>row.id===body.media_id);
      if(index>=0)records.splice(index,1);
      return {data:{ok:true},error:null};
    }},
    from(table){
      if(table==='trips')return {
        insert:()=>result,
        update:()=>({eq:()=>result})
      };
      if(table==='media')return {
        insert:async row=>{calls.push(['reserve',row.storage_path]);records.push(row);return {error:null}},
        select:()=>({
          eq(){return this},
          order:async()=>({data:records.map(row=>({id:row.id,storage_path:row.storage_path,created_at:'2026-10-30'})),error:null})
        })
      };
      throw new Error('Unknown table '+table);
    }
  };
  const convertedPhoto={convert:async file=>{
    if(file.name===failConversionName){
      const error=new Error('A requested file or directory could not be found at the time an operation was processed');
      error.name='NotReadableError';throw error;
    }
    return {blob:new Blob(['reencoded pixels'],{type:'image/webp'}),width:800,height:1200};
  }};
  const context=vm.createContext({
    window:{BEAM_COUNTRIES:COUNTRIES,BEAM_PHOTO:{...PHOTO,...convertedPhoto},
      BEAM_PHOTO_UPLOAD:{uploadOne:params=>uploadOne({...params,idProvider:()=>('photo-'+(++serial))})},
      confirm:message=>{confirmMessages.push(message);return confirmAnswer}},
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
  return {els,records,uploads,revoked,calls,context,select,save,queued,remove,close,setConfirm,confirmMessages,
    failAt:n=>{failAt=n},failConvert:name=>{failConversionName=name},uploadCount:()=>uploadCount};
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
  assert.deepEqual(first.calls.map(entry=>entry[0]),['reserve','upload','reserve','upload'],
    'Each photo must be reserved before Storage upload');
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
  assert.equal(partial.records.length,1,'Failed reservation must be cleaned by travel-delete');
  assert.deepEqual(partial.calls.map(x=>x[0]),['reserve','upload','reserve','upload','cleanup']);
  assert.deepEqual(Array.from(partial.queued()),['retry.jpg']);
  assert.match(partial.els['#tripMsg'].textContent,/Voyage enregistré/);
  assert.match(partial.els['#tripMsg'].textContent,/retry\.jpg/);
  assert.doesNotMatch(partial.els['#tripMsg'].textContent,/A requested file or directory/);
  assert.equal(partial.els['#modal'].classList.contains('open'),true);
  await partial.save();
  assert.equal(partial.records.length,2);
  assert.deepEqual(partial.calls.slice(-2).map(x=>x[0]),['reserve','upload']);
  assert.equal(partial.uploads.length,3,'One failed upload was retried, not the successful photo');
  assert.deepEqual(Array.from(partial.queued()),[]);
  // The Android provider can revoke a File BEFORE its first read. It must
  // become a French error tile, not block the other selected photos.
  const vanished=harness();
  await vanished.select([fake('ok.jpg'),fake('lost.jpg','NotFoundError'),
    fake('locked.jpg','NotReadableError'),fake('next.jpg')]);
  assert.deepEqual(Array.from(vanished.queued()),['ok.jpg','next.jpg']);
  assert.match(vanished.els['#photoGallery'].innerHTML,/lost\.jpg/);
  assert.match(vanished.els['#photoGallery'].innerHTML,/locked\.jpg/);
  assert.equal((vanished.els['#photoGallery'].innerHTML.match(/Cette photo n'est plus accessible/g)||[]).length,2);
  assert.doesNotMatch(vanished.els['#photoGallery'].innerHTML,/A requested file or directory/);
  assert.match(vanished.els['#photoUsage'].textContent,/2 en attente \/ 10/);
  await vanished.save();
  assert.equal(vanished.uploads.length,2);
  assert.equal(vanished.records.length,2);
  assert.match(vanished.els['#appMsg'].textContent,/lost\.jpg/);
  assert.match(vanished.els['#appMsg'].textContent,/locked\.jpg/);

  // This source is readable during selection, then goes away. The stable
  // in-memory snapshot must still be uploaded; no second provider read.
  const revokedSource=harness(),original=fake('snapshot.jpg');
  await revokedSource.select([original]);
  original.revoke();
  await revokedSource.save();
  assert.equal(revokedSource.uploads.length,1);
  assert.equal(revokedSource.records.length,1);

  // A file can even fail DURING conversion/upload. Save the voyage and
  // both surrounding images; the failed file gets its own named error.
  const during=harness();
  during.failConvert('failed-at-send.jpg');
  await during.select([fake('first.jpg'),fake('failed-at-send.jpg'),fake('third.jpg')]);
  await during.save();
  assert.equal(during.records.length,2);
  assert.equal(during.uploads.length,2);
  assert.deepEqual(Array.from(during.queued()),[]);
  assert.equal(during.els['#modal'].classList.contains('open'),true);
  assert.match(during.els['#tripMsg'].textContent,/Voyage enregistré/);
  assert.match(during.els['#tripMsg'].textContent,/failed-at-send\.jpg/);
  assert.match(during.els['#tripMsg'].textContent,/Cette photo n'est plus accessible/);
  assert.doesNotMatch(during.els['#tripMsg'].textContent,/A requested file or directory/);
  assert.match(during.els['#photoGallery'].innerHTML,/failed-at-send\.jpg/);

  // Upload network failure at the second of THREE files must not prevent the
  // third from being stored; retry only sends the failed second item.
  const continuing=harness();
  continuing.failAt(2);
  await continuing.select([fake('one.jpg'),fake('two.jpg'),fake('three.jpg')]);
  await continuing.save();
  assert.equal(continuing.uploads.length,3);
  assert.equal(continuing.records.length,2);
  assert.deepEqual(Array.from(continuing.queued()),['two.jpg']);
  assert.match(continuing.els['#tripMsg'].textContent,/two\.jpg/);
  await continuing.save();
  assert.equal(continuing.uploads.length,4);
  assert.equal(continuing.records.length,3);

  console.log('BEAM photo queue PASS: successive selections, durable snapshots, unreadable sources, partial upload and retry');
}
main().catch(err=>{console.error(err);process.exitCode=1});
