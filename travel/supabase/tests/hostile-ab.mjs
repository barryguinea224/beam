// BEAM Travel History — hostile staging test
// Run locally only. Never commit .env or credentials.
// Required env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, A_EMAIL, A_PASSWORD, B_EMAIL, B_PASSWORD
import { createClient } from '@supabase/supabase-js'

const req = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','A_EMAIL','A_PASSWORD','B_EMAIL','B_PASSWORD']
for (const k of req) if (!process.env[k]) throw new Error(`Missing ${k}`)

const mk = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})
const A=mk(), B=mk()
const login=async(c,email,password)=>{
  const {data,error}=await c.auth.signInWithPassword({email,password})
  if(error) throw error
  return data.session
}
const ok=(v,msg)=>{ if(!v) throw new Error(msg) }
const denied=(error,msg)=>ok(!!error,msg)

const sa=await login(A,process.env.A_EMAIL,process.env.A_PASSWORD)
const sb=await login(B,process.env.B_EMAIL,process.env.B_PASSWORD)
ok(sa?.access_token && sb?.access_token,'Real JWT sessions required')
ok(sa.user.id!==sb.user.id,'A and B must be distinct users')

// Positive path: A can create and read own trip.
const {data:trip,error:createErr}=await A.from('trips').insert({
  country_code:'GN', cities:'Conakry', entry_date:'2026-01-01', exit_date:'2026-01-02', purpose:'autre'
}).select().single()
if(createErr) throw createErr
const tripId=trip.id

const {data:own,error:ownErr}=await A.from('trips').select('id').eq('id',tripId)
if(ownErr) throw ownErr
ok(own.length===1,'A must read own trip')

// B must not see A.
const {data:seen,error:seenErr}=await B.from('trips').select('*').eq('id',tripId)
if(seenErr) throw seenErr
ok(seen.length===0,'RLS FAILURE: B can read A trip')

// B update/delete must affect zero rows.
const {data:upd,error:updErr}=await B.from('trips').update({cities:'ATTACK'}).eq('id',tripId).select()
if(updErr) throw updErr
ok(upd.length===0,'RLS FAILURE: B updated A trip')
const {data:del,error:delErr}=await B.from('trips').delete().eq('id',tripId).select()
if(delErr) throw delErr
ok(del.length===0,'RLS FAILURE: B deleted A trip')

// Reserved profile fields must reject A directly.
const {error:flagErr}=await A.from('profiles').update({deleting:false}).eq('id',sa.user.id)
denied(flagErr,'PRIVILEGE FAILURE: client changed deleting')

// Storage positive path.
const ownPath=`${sa.user.id}/hostile-test.txt`
const blob=new Blob(['beam-staging-test'],{type:'text/plain'})
const {error:uploadErr}=await A.storage.from('media').upload(ownPath,blob,{upsert:false})
// Current bucket only permits image MIME, so a text upload must fail.
denied(uploadErr,'BUCKET FAILURE: unexpected text MIME accepted')

console.log('PASS: JWT/RLS table isolation and reserved profile-field checks')
console.log('NEXT: image upload, cross-user Storage, deleting-state, old-JWT and upsert replay require test image + server deletion function')
