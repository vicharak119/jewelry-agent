// Jewelry Marketing Agent - Cloudflare Pages Function
// All API routes in one catch-all handler. Uses D1 + R2.

function json(data, s=200){return new Response(JSON.stringify(data),{status:s,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});}
function err(m,s=400){return json({error:m},s);}

async function sha256(str){
  var buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0");}).join("");
}

function b64u(input){
  var str;
  if(typeof input==="string")str=input;
  else str=String.fromCharCode.apply(null,new Uint8Array(input));
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function makeJWT(payload,secret){
  var header=b64u(JSON.stringify({alg:"HS256",typ:"JWT"}));
  var body=b64u(JSON.stringify(Object.assign({},payload,{exp:Math.floor(Date.now()/1000)+86400})));
  var msg=header+"."+body;
  var key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  var sig=b64u(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(msg)));
  return msg+"."+sig;
}

async function checkJWT(token,secret){
  var parts=token.split(".");if(parts.length!==3)throw new Error("Bad token");
  var key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  var sigBytes=Uint8Array.from(atob(parts[2].replace(/-/g,"+").replace(/_/g,"/")),function(c){return c.charCodeAt(0);});
  var ok=await crypto.subtle.verify("HMAC",key,sigBytes,new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!ok)throw new Error("Invalid");
  var p=JSON.parse(atob(parts[1].replace(/-/g,"+").replace(/_/g,"/")));
  if(p.exp&&p.exp<Math.floor(Date.now()/1000))throw new Error("Expired");
  return p;
}

async function getAuth(req,env){
  var a=req.headers.get("Authorization");if(!a)return null;
  try{return await checkJWT(a.replace("Bearer ",""),env.JWT_SECRET||"default-jwt-secret");}catch(e){return null;}
}

async function getS(db,k){var r=await db.prepare("SELECT value FROM settings WHERE key=?").bind(k).first();return r?r.value:"";}
async function setS(db,k,v){await db.prepare("INSERT OR REPLACE INTO settings(key,value)VALUES(?,?)").bind(k,v).run();}

export async function onRequest(ctx){
  var req=ctx.request,env=ctx.env,url=new URL(req.url);
  var path=url.pathname.replace("/api/",""),method=req.method;
  var DB=env.DB,R2=env.STORAGE;

  if(method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization"}});

  try{

  // == AUTH: Setup check ==
  if(method==="GET"&&path==="auth/needs-setup"){
    var c=await DB.prepare("SELECT COUNT(*)as c FROM users").first();
    return json({needsSetup:!c||c.c===0});
  }

  // == AUTH: Initial setup ==
  if(method==="POST"&&path==="auth/setup"){
    var c=await DB.prepare("SELECT COUNT(*)as c FROM users").first();
    if(c&&c.c>0)return err("Already set up");
    var b=await req.json();if(!b.username||!b.password)return err("Username+password required");
    var id=crypto.randomUUID(),h=await sha256(b.password);
    await DB.prepare("INSERT INTO users(id,username,password_hash,role,must_change_password,created_at,created_by)VALUES(?,?,?,'admin',0,?,?)").bind(id,b.username.toLowerCase().trim(),h,new Date().toISOString(),"system").run();
    var tk=await makeJWT({id:id,username:b.username.toLowerCase().trim(),role:"admin"},env.JWT_SECRET||"default-jwt-secret");
    return json({token:tk,role:"admin",username:b.username.toLowerCase().trim()});
  }

  // == AUTH: Login ==
  if(method==="POST"&&path==="auth/login"){
    var b=await req.json();if(!b.username||!b.password)return err("Username+password required");
    var u=await DB.prepare("SELECT * FROM users WHERE username=?").bind(b.username.toLowerCase().trim()).first();
    if(!u)return err("Invalid credentials",401);
    var h=await sha256(b.password);if(h!==u.password_hash)return err("Invalid credentials",401);
    var tk=await makeJWT({id:u.id,username:u.username,role:u.role},env.JWT_SECRET||"default-jwt-secret");
    return json({token:tk,mustChangePassword:!!u.must_change_password,role:u.role,username:u.username});
  }

  // -- Auth required below --
  var user=await getAuth(req,env);
  if(!user)return err("Not authenticated",401);
  var isAdmin=user.role==="admin";

  // == AUTH: Me ==
  if(method==="GET"&&path==="auth/me"){
    var u=await DB.prepare("SELECT id,username,role,must_change_password FROM users WHERE id=?").bind(user.id).first();
    return u?json({id:u.id,username:u.username,role:u.role,mustChangePassword:!!u.must_change_password}):err("Not found",404);
  }

  // == AUTH: Change password ==
  if(method==="POST"&&path==="auth/change-password"){
    var b=await req.json(),np=b.newPassword;
    if(!np||np.length<8)return err("Min 8 chars");
    if(!/[A-Z]/.test(np)||!/[0-9]/.test(np)||!/[^A-Za-z0-9]/.test(np))return err("Need uppercase+number+special char");
    await DB.prepare("UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?").bind(await sha256(np),user.id).run();
    var tk=await makeJWT({id:user.id,username:user.username,role:user.role},env.JWT_SECRET||"default-jwt-secret");
    return json({token:tk,message:"Password changed"});
  }

  // == USERS: List ==
  if(method==="GET"&&path==="users"){
    if(!isAdmin)return err("Admin only",403);
    var r=await DB.prepare("SELECT id,username,role,must_change_password,created_at,created_by FROM users ORDER BY created_at").all();
    return json(r.results||[]);
  }

  // == USERS: Create ==
  if(method==="POST"&&path==="users"){
    if(!isAdmin)return err("Admin only",403);
    var b=await req.json();if(!b.username||!b.password)return err("Username+password required");
    if(b.role!=="admin"&&b.role!=="user")return err("Role: admin or user");
    var ex=await DB.prepare("SELECT id FROM users WHERE username=?").bind(b.username.toLowerCase().trim()).first();
    if(ex)return err("Username exists",409);
    var id=crypto.randomUUID();
    await DB.prepare("INSERT INTO users(id,username,password_hash,role,must_change_password,created_at,created_by)VALUES(?,?,?,?,1,?,?)").bind(id,b.username.toLowerCase().trim(),await sha256(b.password),b.role,new Date().toISOString(),user.username).run();
    return json({id:id,username:b.username.toLowerCase().trim(),role:b.role,message:"User created"});
  }

  // == USERS: Delete ==
  if(method==="DELETE"&&path.indexOf("users/")===0){
    if(!isAdmin)return err("Admin only",403);
    var uid=path.replace("users/","");if(uid===user.id)return err("Cannot delete yourself");
    await DB.prepare("DELETE FROM users WHERE id=?").bind(uid).run();
    return json({message:"Deleted"});
  }

  // == SETTINGS: Get (admin) ==
  if(method==="GET"&&path==="settings"){
    if(!isAdmin)return err("Admin only",403);
    var rows=await DB.prepare("SELECT key,value FROM settings").all();
    var s={};for(var r of(rows.results||[])){
      if((r.key==="openaiKey"||r.key==="driveRefreshToken")&&r.value)s[r.key]="***configured***";
      else if(r.key==="driveClientSecret"&&r.value)s[r.key]="***";
      else s[r.key]=r.value;
    }return json(s);
  }

  // == SETTINGS: Update (admin) ==
  if(method==="POST"&&path==="settings"){
    if(!isAdmin)return err("Admin only",403);
    var b=await req.json();
    for(var k in b){if(b[k]==="***configured***"||b[k]==="***")continue;await setS(DB,k,b[k]);}
    return json({message:"Saved"});
  }

  // == SETTINGS: Public ==
  if(method==="GET"&&path==="settings/public"){
    var keys=["brandName","tagline","logoPos","model","quality","style"],s={};
    for(var k of keys)s[k]=await getS(DB,k);
    s.hasApiKey=!!(await getS(DB,"openaiKey"));
    var logo=await R2.get("logo.png");
    if(logo){var buf=await logo.arrayBuffer();s.logoBase64="data:image/png;base64,"+btoa(String.fromCharCode.apply(null,new Uint8Array(buf)));}
    return json(s);
  }

  // == ANALYZE ==
  if(method==="POST"&&path==="analyze"){
    var apiKey=await getS(DB,"openaiKey");if(!apiKey)return err("No API key. Ask admin.");
    var fd=await req.formData(),file=fd.get("image");if(!file)return err("No image");
    var buf=await file.arrayBuffer();
    var b64=btoa(String.fromCharCode.apply(null,new Uint8Array(buf)));
    var inputKey="uploads/"+user.username+"/"+Date.now()+"_"+(file.name||"input.jpg");
    await R2.put(inputKey,buf,{httpMetadata:{contentType:file.type||"image/jpeg"}});
    var r=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
      body:JSON.stringify({model:"gpt-4o",max_tokens:1000,messages:[
        {role:"system",content:'Luxury jewelry photography director. EXTREME precision. ONLY valid JSON: {"type":"type","metal":"metal","elements":"detailed","style":"style","chain_type":"chain","display":"mannequin","background":"bg","props":"props","color_mood":"palette"}'},
        {role:"user",content:[{type:"image_url",image_url:{url:"data:image/jpeg;base64,"+b64,detail:"high"}},{type:"text",text:"Analyze. JSON only."}]}
      ]})
    });
    if(!r.ok){var e=await r.json().catch(function(){return{};});throw new Error(e.error&&e.error.message||"OpenAI error");}
    var d=await r.json();var raw=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||"";
    var analysis=JSON.parse(raw.replace(/```json\s*/g,"").replace(/```/g,"").trim());
    return json({analysis:analysis,inputFile:inputKey});
  }

  // == GENERATE ==
  if(method==="POST"&&path==="generate"){
    var apiKey=await getS(DB,"openaiKey");if(!apiKey)return err("No API key");
    var b=await req.json();
    var mdl=b.model||await getS(DB,"model")||"gpt-image-2";
    var qual=b.quality||await getS(DB,"quality")||"medium";
    var r=await fetch("https://api.openai.com/v1/images/generations",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
      body:JSON.stringify({model:mdl,prompt:b.prompt,n:1,size:"1024x1024",quality:qual})
    });
    if(!r.ok){var e=await r.json().catch(function(){return{};});throw new Error(e.error&&e.error.message||"Error");}
    var d=await r.json();var imgB64=d.data&&d.data[0]&&d.data[0].b64_json;
    var outKey=null;
    if(imgB64){outKey="outputs/"+user.username+"/"+Date.now()+"_gen.png";await R2.put(outKey,Uint8Array.from(atob(imgB64),function(c){return c.charCodeAt(0);}),{httpMetadata:{contentType:"image/png"}});}
    var cost=qual==="high"?"~Rs15-18":qual==="low"?"~Rs0.5":"~Rs4-5";
    await DB.prepare("INSERT INTO activity(id,timestamp,username,input_file,output_file,jewelry_type,scene_json,photo_style,model,quality,status,cost_estimate)VALUES(?,?,?,?,?,?,?,?,?,?,'success',?)")
      .bind(crypto.randomUUID(),new Date().toISOString(),user.username,b.inputFile||"",outKey||"",b.analysis&&b.analysis.type||"",JSON.stringify(b.scene||{}),b.style||"",mdl,qual,cost).run();
    return json({b64_json:imgB64,url:d.data&&d.data[0]&&d.data[0].url,outputFile:outKey});
  }

  // == SAVE FINAL ==
  if(method==="POST"&&path==="save-final"){
    var b=await req.json();if(!b.imageData)return err("No data");
    var raw=b.imageData.replace(/^data:image\/\w+;base64,/,"");
    var fk="outputs/"+user.username+"/"+Date.now()+"_final.png";
    await R2.put(fk,Uint8Array.from(atob(raw),function(c){return c.charCodeAt(0);}),{httpMetadata:{contentType:"image/png"}});
    return json({filename:fk});
  }

  // == LOGS ==
  if(method==="GET"&&path==="logs"){
    var r;
    if(isAdmin)r=await DB.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 200").all();
    else r=await DB.prepare("SELECT * FROM activity WHERE username=? ORDER BY timestamp DESC LIMIT 200").bind(user.username).all();
    return json(r.results||[]);
  }

  // == DRIVE: Auth URL ==
  if(method==="GET"&&path==="drive/auth-url"){
    if(!isAdmin)return err("Admin only",403);
    var cid=await getS(DB,"driveClientId");if(!cid)return err("Set Drive Client ID first");
    var redir=url.origin+"/api/drive/callback";
    return json({url:"https://accounts.google.com/o/oauth2/v2/auth?client_id="+encodeURIComponent(cid)+"&redirect_uri="+encodeURIComponent(redir)+"&response_type=code&scope="+encodeURIComponent("https://www.googleapis.com/auth/drive.file")+"&access_type=offline&prompt=consent"});
  }

  // == DRIVE: Callback ==
  if(method==="GET"&&path==="drive/callback"){
    var code=url.searchParams.get("code");if(!code)return new Response("No code",{status:400});
    var cid=await getS(DB,"driveClientId"),cs=await getS(DB,"driveClientSecret"),redir=url.origin+"/api/drive/callback";
    var r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:"code="+code+"&client_id="+cid+"&client_secret="+cs+"&redirect_uri="+encodeURIComponent(redir)+"&grant_type=authorization_code"});
    var d=await r.json();if(!d.refresh_token)return new Response("No refresh token. Revoke at myaccount.google.com/permissions",{status:400});
    await setS(DB,"driveRefreshToken",d.refresh_token);
    return new Response("<html><body style='font-family:Georgia;text-align:center;padding:60px'><h2>Drive Connected!</h2><p>Close this tab.</p></body></html>",{headers:{"Content-Type":"text/html"}});
  }

  // == DRIVE: Status ==
  if(method==="GET"&&path==="drive/status"){
    if(!isAdmin)return err("Admin only",403);
    return json({connected:!!(await getS(DB,"driveRefreshToken")),lastBackup:await getS(DB,"driveLastBackup"),backupHours:await getS(DB,"driveBackupHours")||"2"});
  }

  // == DRIVE: Backup Now ==
  if(method==="POST"&&path==="drive/backup-now"){
    if(!isAdmin)return err("Admin only",403);
    var rt=await getS(DB,"driveRefreshToken");if(!rt)return err("Drive not connected");
    var cid=await getS(DB,"driveClientId"),cs=await getS(DB,"driveClientSecret");
    var tr=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:"refresh_token="+rt+"&client_id="+cid+"&client_secret="+cs+"&grant_type=refresh_token"});
    var td=await tr.json();if(!td.access_token)return err("Token refresh failed");
    var at=td.access_token;
    var fid=await getS(DB,"driveFolderId");
    if(!fid){var fr=await fetch("https://www.googleapis.com/drive/v3/files",{method:"POST",headers:{"Authorization":"Bearer "+at,"Content-Type":"application/json"},body:JSON.stringify({name:"Jewelry Marketing Agent",mimeType:"application/vnd.google-apps.folder"})});var fd=await fr.json();fid=fd.id;await setS(DB,"driveFolderId",fid);}
    var logs=await DB.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 1000").all();
    var csv="ID,Timestamp,User,Type,Style,Model,Quality,Status,Cost\n";
    for(var l of(logs.results||[]))csv+=[l.id,l.timestamp,l.username,l.jewelry_type,l.photo_style,l.model,l.quality,l.status,l.cost_estimate].join(",")+"";
    var bnd="----B"+Date.now();var meta=JSON.stringify({name:"activity_"+new Date().toISOString().slice(0,10)+".csv",parents:[fid]});
    var mp="--"+bnd+"\r\nContent-Type: application/json\r\n\r\n"+meta+"\r\n--"+bnd+"\r\nContent-Type: text/csv\r\n\r\n"+csv+"\r\n--"+bnd+"--";
    await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",{method:"POST",headers:{"Authorization":"Bearer "+at,"Content-Type":"multipart/related; boundary="+bnd},body:mp});
    await setS(DB,"driveLastBackup",new Date().toISOString());
    return json({message:"Backup done"});
  }

  return err("Not found: "+path,404);
  }catch(e){return json({error:e.message||"Server error"},500);}
}
