"use strict";
// Local synthetic browser fixture; never use a staging or production key.
const CONFIG_PATH="/travel/config.js";
const BODY='window.BEAM_TRAVEL_CONFIG = {supabaseUrl:"https://fixture.invalid",supabaseAnonKey:"sb_publishable_synthetic_test_only"};\n';
function intercept(req,res){
 if(new URL(req.url,"http://localhost").pathname!==CONFIG_PATH)return false;
 res.writeHead(200,{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"});
 res.end(BODY);
 return true;
}
module.exports={intercept,CONFIG_PATH,BODY};
