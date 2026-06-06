// Jewelry Marketing Agent v6 - Cloudflare Pages Function
// All API routes in one catch-all handler. Uses D1 + R2. Zero dependencies.
//
// v6 changes vs v5:
//  - Added POST /api/settings/logo (logo upload to R2)  [issue #1, #15]
//  - /api/logs and /api/users now return camelCase fields + IST-formatted
//    timestamps, fixing "-"/"Invalid Date" in the UI            [issues #3,#4,#5,#6]
//  - Model + image size are admin-configurable with safe defaults
//  - Added GET /api/export/csv (activity log) and GET /api/export/images (zip) [issue #13]
//  - settings/public returns the logo's real content-type
//  - Drive settings stay flat keys (matched by the rewritten frontend)

function json(data, s = 200) {
  return new Response(JSON.stringify(data), {
    status: s,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
function err(m, s = 400) { return json({ error: m }, s); }

async function sha256(str) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function b64u(input) {
  var str;
  if (typeof input === "string") str = input;
  else str = String.fromCharCode.apply(null, new Uint8Array(input));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makeJWT(payload, secret) {
  var header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  var body = b64u(JSON.stringify(Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + 86400 })));
  var msg = header + "." + body;
  var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sig = b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return msg + "." + sig;
}

async function checkJWT(token, secret) {
  var parts = token.split("."); if (parts.length !== 3) throw new Error("Bad token");
  var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  var sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), function (c) { return c.charCodeAt(0); });
  var ok = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("Invalid");
  var p = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (p.exp && p.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  return p;
}

async function getAuth(req, env) {
  var a = req.headers.get("Authorization"); if (!a) return null;
  try { return await checkJWT(a.replace("Bearer ", ""), env.JWT_SECRET || "default-jwt-secret"); } catch (e) { return null; }
}

async function getS(db, k) { var r = await db.prepare("SELECT value FROM settings WHERE key=?").bind(k).first(); return r ? r.value : ""; }
async function setS(db, k, v) { await db.prepare("INSERT OR REPLACE INTO settings(key,value)VALUES(?,?)").bind(k, v == null ? "" : String(v)).run(); }

// IST (Asia/Kolkata) formatter -> "DD-MMM-YYYY HH:MM:SS AM/PM"
function istFmt(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  try {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    }).formatToParts(d);
    var m = {}; parts.forEach(function (p) { m[p.type] = p.value; });
    return m.day + "-" + m.month + "-" + m.year + " " + m.hour + ":" + m.minute + ":" + m.second + " " + (m.dayPeriod || "").toUpperCase();
  } catch (e) { return iso; }
}

function mapLog(l) {
  return {
    id: l.id, timestamp: l.timestamp, timestampIST: istFmt(l.timestamp),
    username: l.username, inputFile: l.input_file, outputFile: l.output_file, finalFile: l.final_file,
    jewelryType: l.jewelry_type, sceneJson: l.scene_json, photoStyle: l.photo_style,
    model: l.model, quality: l.quality, status: l.status, costEstimate: l.cost_estimate, errorMsg: l.error_msg,
  };
}
function mapUser(u) {
  return {
    id: u.id, username: u.username, role: u.role, mustChangePassword: !!u.must_change_password,
    createdAt: u.created_at, createdAtIST: istFmt(u.created_at), createdBy: u.created_by,
  };
}

// ---- CRC32 + minimal STORE-method ZIP (no compression, no dependencies) ----
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  // files: [{name:string, data:Uint8Array}]
  var enc = new TextEncoder();
  var chunks = [];
  var central = [];
  var offset = 0;
  function u16(n) { return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]); }
  function u32(n) { n = n >>> 0; return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]); }
  function push(arr, u8) { arr.push(u8); return u8.length; }

  for (var i = 0; i < files.length; i++) {
    var nameBytes = enc.encode(files[i].name);
    var data = files[i].data;
    var crc = crc32(data);
    var localStart = offset;
    // Local file header
    offset += push(chunks, u32(0x04034b50));   // signature
    offset += push(chunks, u16(20));            // version needed
    offset += push(chunks, u16(0));             // flags
    offset += push(chunks, u16(0));             // method = store
    offset += push(chunks, u16(0));             // mod time
    offset += push(chunks, u16(0x21));          // mod date (arbitrary valid date)
    offset += push(chunks, u32(crc));           // crc32
    offset += push(chunks, u32(data.length));   // compressed size
    offset += push(chunks, u32(data.length));   // uncompressed size
    offset += push(chunks, u16(nameBytes.length));
    offset += push(chunks, u16(0));             // extra len
    offset += push(chunks, nameBytes);
    offset += push(chunks, data);

    // Central directory record (built now, concatenated after all locals)
    var cd = [];
    push(cd, u32(0x02014b50));   // signature
    push(cd, u16(20));           // version made by
    push(cd, u16(20));           // version needed
    push(cd, u16(0));            // flags
    push(cd, u16(0));            // method
    push(cd, u16(0));            // mod time
    push(cd, u16(0x21));         // mod date
    push(cd, u32(crc));
    push(cd, u32(data.length));
    push(cd, u32(data.length));
    push(cd, u16(nameBytes.length));
    push(cd, u16(0));            // extra len
    push(cd, u16(0));            // comment len
    push(cd, u16(0));            // disk number
    push(cd, u16(0));            // internal attrs
    push(cd, u32(0));            // external attrs
    push(cd, u32(localStart));   // local header offset
    push(cd, nameBytes);
    central.push(cd);
  }

  var centralStart = offset;
  var centralSize = 0;
  for (var j = 0; j < central.length; j++) {
    for (var x = 0; x < central[j].length; x++) { chunks.push(central[j][x]); centralSize += central[j][x].length; }
  }
  // End of central directory
  chunks.push(u32(0x06054b50));
  chunks.push(u16(0));            // disk
  chunks.push(u16(0));            // disk with CD
  chunks.push(u16(files.length)); // entries this disk
  chunks.push(u16(files.length)); // entries total
  chunks.push(u32(centralSize));
  chunks.push(u32(centralStart));
  chunks.push(u16(0));            // comment len

  var total = 0; for (var a = 0; a < chunks.length; a++) total += chunks[a].length;
  var out = new Uint8Array(total);
  var pos = 0;
  for (var b = 0; b < chunks.length; b++) { out.set(chunks[b], pos); pos += chunks[b].length; }
  return out;
}

export async function onRequest(ctx) {
  var req = ctx.request, env = ctx.env, url = new URL(req.url);
  var path = url.pathname.replace("/api/", ""), method = req.method;
  var DB = env.DB, R2 = env.STORAGE;

  if (method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" } });

  try {

    // == AUTH: Setup check ==
    if (method === "GET" && path === "auth/needs-setup") {
      var c = await DB.prepare("SELECT COUNT(*)as c FROM users").first();
      return json({ needsSetup: !c || c.c === 0 });
    }

    // == AUTH: Initial setup ==
    if (method === "POST" && path === "auth/setup") {
      var c2 = await DB.prepare("SELECT COUNT(*)as c FROM users").first();
      if (c2 && c2.c > 0) return err("Already set up");
      var b = await req.json(); if (!b.username || !b.password) return err("Username+password required");
      var id = crypto.randomUUID(), h = await sha256(b.password);
      await DB.prepare("INSERT INTO users(id,username,password_hash,role,must_change_password,created_at,created_by)VALUES(?,?,?,'admin',0,?,?)").bind(id, b.username.toLowerCase().trim(), h, new Date().toISOString(), "system").run();
      var tk = await makeJWT({ id: id, username: b.username.toLowerCase().trim(), role: "admin" }, env.JWT_SECRET || "default-jwt-secret");
      return json({ token: tk, role: "admin", username: b.username.toLowerCase().trim() });
    }

    // == AUTH: Login ==
    if (method === "POST" && path === "auth/login") {
      var lb = await req.json(); if (!lb.username || !lb.password) return err("Username+password required");
      var u = await DB.prepare("SELECT * FROM users WHERE username=?").bind(lb.username.toLowerCase().trim()).first();
      if (!u) return err("Invalid credentials", 401);
      var lh = await sha256(lb.password); if (lh !== u.password_hash) return err("Invalid credentials", 401);
      var ltk = await makeJWT({ id: u.id, username: u.username, role: u.role }, env.JWT_SECRET || "default-jwt-secret");
      return json({ token: ltk, mustChangePassword: !!u.must_change_password, role: u.role, username: u.username });
    }

    // -- Auth required below --
    var user = await getAuth(req, env);
    if (!user) return err("Not authenticated", 401);
    var isAdmin = user.role === "admin";

    // == AUTH: Me ==
    if (method === "GET" && path === "auth/me") {
      var me = await DB.prepare("SELECT id,username,role,must_change_password FROM users WHERE id=?").bind(user.id).first();
      return me ? json({ id: me.id, username: me.username, role: me.role, mustChangePassword: !!me.must_change_password }) : err("Not found", 404);
    }

    // == AUTH: Change password ==
    if (method === "POST" && path === "auth/change-password") {
      var cb = await req.json(), np = cb.newPassword;
      if (!np || np.length < 8) return err("Min 8 chars");
      if (!/[A-Z]/.test(np) || !/[0-9]/.test(np) || !/[^A-Za-z0-9]/.test(np)) return err("Need uppercase+number+special char");
      await DB.prepare("UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?").bind(await sha256(np), user.id).run();
      var ctk = await makeJWT({ id: user.id, username: user.username, role: user.role }, env.JWT_SECRET || "default-jwt-secret");
      return json({ token: ctk, message: "Password changed" });
    }

    // == USERS: List ==
    if (method === "GET" && path === "users") {
      if (!isAdmin) return err("Admin only", 403);
      var ur = await DB.prepare("SELECT id,username,role,must_change_password,created_at,created_by FROM users ORDER BY created_at").all();
      return json((ur.results || []).map(mapUser));
    }

    // == USERS: Create ==
    if (method === "POST" && path === "users") {
      if (!isAdmin) return err("Admin only", 403);
      var nb = await req.json(); if (!nb.username || !nb.password) return err("Username+password required");
      if (nb.role !== "admin" && nb.role !== "user") return err("Role: admin or user");
      var ex = await DB.prepare("SELECT id FROM users WHERE username=?").bind(nb.username.toLowerCase().trim()).first();
      if (ex) return err("Username exists", 409);
      var nid = crypto.randomUUID();
      await DB.prepare("INSERT INTO users(id,username,password_hash,role,must_change_password,created_at,created_by)VALUES(?,?,?,?,1,?,?)").bind(nid, nb.username.toLowerCase().trim(), await sha256(nb.password), nb.role, new Date().toISOString(), user.username).run();
      return json({ id: nid, username: nb.username.toLowerCase().trim(), role: nb.role, message: "User created" });
    }

    // == USERS: Delete ==
    if (method === "DELETE" && path.indexOf("users/") === 0) {
      if (!isAdmin) return err("Admin only", 403);
      var uid = path.replace("users/", ""); if (uid === user.id) return err("Cannot delete yourself");
      await DB.prepare("DELETE FROM users WHERE id=?").bind(uid).run();
      return json({ message: "Deleted" });
    }

    // == SETTINGS: Get (admin) ==
    if (method === "GET" && path === "settings") {
      if (!isAdmin) return err("Admin only", 403);
      var rows = await DB.prepare("SELECT key,value FROM settings").all();
      var s = {};
      for (var r of (rows.results || [])) {
        if ((r.key === "openaiKey" || r.key === "driveRefreshToken") && r.value) s[r.key] = "***configured***";
        else if (r.key === "driveClientSecret" && r.value) s[r.key] = "***";
        else s[r.key] = r.value;
      }
      var logoObj = await R2.head ? await R2.head("logo.png").catch(function () { return null; }) : null;
      s.hasLogo = !!logoObj;
      return json(s);
    }

    // == SETTINGS: Update (admin) ==
    if (method === "POST" && path === "settings") {
      if (!isAdmin) return err("Admin only", 403);
      var sb = await req.json();
      for (var k in sb) { if (sb[k] === "***configured***" || sb[k] === "***") continue; await setS(DB, k, sb[k]); }
      return json({ message: "Saved" });
    }

    // == SETTINGS: Upload logo (admin) ==  [issue #1, #15]
    if (method === "POST" && path === "settings/logo") {
      if (!isAdmin) return err("Admin only", 403);
      var lfd = await req.formData(); var lf = lfd.get("logo");
      if (!lf || typeof lf === "string") return err("No logo file");
      var lbuf = await lf.arrayBuffer();
      var lct = lf.type || "image/png";
      await R2.put("logo.png", lbuf, { httpMetadata: { contentType: lct } });
      return json({ message: "Logo uploaded" });
    }

    // == SETTINGS: Public ==
    if (method === "GET" && path === "settings/public") {
      var keys = ["brandName", "tagline", "logoPos", "model", "quality", "size", "style"], ps = {};
      for (var pk of keys) ps[pk] = await getS(DB, pk);
      ps.hasApiKey = !!(await getS(DB, "openaiKey"));
      var logo = await R2.get("logo.png");
      if (logo) {
        var lbuf2 = await logo.arrayBuffer();
        var lct2 = (logo.httpMetadata && logo.httpMetadata.contentType) || "image/png";
        ps.logoBase64 = "data:" + lct2 + ";base64," + b64FromBuf(lbuf2);
      }
      return json(ps);
    }

    // == ANALYZE ==
    if (method === "POST" && path === "analyze") {
      var apiKey = await getS(DB, "openaiKey"); if (!apiKey) return err("No API key. Ask admin.");
      var fd = await req.formData(), file = fd.get("image"); if (!file || typeof file === "string") return err("No image");
      var buf = await file.arrayBuffer();
      var imgB = b64FromBuf(buf);
      var inputKey = "uploads/" + user.username + "/" + Date.now() + "_" + (file.name || "input.jpg");
      await R2.put(inputKey, buf, { httpMetadata: { contentType: file.type || "image/jpeg" } });
      var ar = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({
          model: "gpt-4o", max_tokens: 1000, messages: [
            { role: "system", content: 'You are a luxury jewelry photography director. Analyze the jewelry with EXTREME precision - every charm, stone, bead, chain link pattern matters. Return ONLY valid JSON: {"type":"specific type","metal":"metal/finish","elements":"VERY detailed description - count of charms, exact shapes, colors, placement, spacing","style":"design style","chain_type":"chain type","display":"recommended mannequin/display","background":"background","props":"3-4 props comma separated","color_mood":"palette"}' },
            { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64," + imgB, detail: "high" } }, { type: "text", text: "Analyze this jewelry with extreme detail. Every element matters for accurate reproduction. JSON only." }] },
          ],
        }),
      });
      if (!ar.ok) { var ae = await ar.json().catch(function () { return {}; }); throw new Error((ae.error && ae.error.message) || "OpenAI error"); }
      var ad = await ar.json(); var raw = (ad.choices && ad.choices[0] && ad.choices[0].message && ad.choices[0].message.content) || "";
      var analysis = JSON.parse(raw.replace(/```json\s*/g, "").replace(/```/g, "").trim());
      return json({ analysis: analysis, inputFile: inputKey });
    }

    // == GENERATE ==
    if (method === "POST" && path === "generate") {
      var gKey = await getS(DB, "openaiKey"); if (!gKey) return err("No API key");
      var gb = await req.json();
      var mdl = gb.model || (await getS(DB, "model")) || "gpt-image-2";
      var qual = gb.quality || (await getS(DB, "quality")) || "medium";
      var size = gb.size || (await getS(DB, "size")) || "1024x1024";
      var gr = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + gKey },
        body: JSON.stringify({ model: mdl, prompt: gb.prompt, n: 1, size: size, quality: qual }),
      });
      if (!gr.ok) {
        var ge = await gr.json().catch(function () { return {}; });
        var gmsg = (ge.error && ge.error.message) || "Error";
        // Log the failure too, so the audit trail is complete
        await DB.prepare("INSERT INTO activity(id,timestamp,username,input_file,jewelry_type,scene_json,photo_style,model,quality,status,error_msg)VALUES(?,?,?,?,?,?,?,?,?,'error',?)")
          .bind(crypto.randomUUID(), new Date().toISOString(), user.username, gb.inputFile || "", (gb.analysis && gb.analysis.type) || "", JSON.stringify(gb.scene || {}), gb.style || "", mdl, qual, gmsg).run().catch(function () {});
        throw new Error(gmsg);
      }
      var gd = await gr.json(); var imgB64 = gd.data && gd.data[0] && gd.data[0].b64_json;
      var outKey = null;
      if (imgB64) { outKey = "outputs/" + user.username + "/" + Date.now() + "_gen.png"; await R2.put(outKey, Uint8Array.from(atob(imgB64), function (c) { return c.charCodeAt(0); }), { httpMetadata: { contentType: "image/png" } }); }
      var cost = qual === "high" ? "~Rs15-18" : qual === "low" ? "~Rs0.5" : "~Rs4-5";
      await DB.prepare("INSERT INTO activity(id,timestamp,username,input_file,output_file,jewelry_type,scene_json,photo_style,model,quality,status,cost_estimate)VALUES(?,?,?,?,?,?,?,?,?,?,'success',?)")
        .bind(crypto.randomUUID(), new Date().toISOString(), user.username, gb.inputFile || "", outKey || "", (gb.analysis && gb.analysis.type) || "", JSON.stringify(gb.scene || {}), gb.style || "", mdl, qual, cost).run();
      return json({ b64_json: imgB64, url: gd.data && gd.data[0] && gd.data[0].url, outputFile: outKey });
    }

    // == SAVE FINAL ==
    if (method === "POST" && path === "save-final") {
      var fb = await req.json(); if (!fb.imageData) return err("No data");
      var fraw = fb.imageData.replace(/^data:image\/\w+;base64,/, "");
      var fk = "outputs/" + user.username + "/" + Date.now() + "_final.png";
      await R2.put(fk, Uint8Array.from(atob(fraw), function (c) { return c.charCodeAt(0); }), { httpMetadata: { contentType: "image/png" } });
      // attach final file to the most recent activity row for this user
      await DB.prepare("UPDATE activity SET final_file=? WHERE id=(SELECT id FROM activity WHERE username=? ORDER BY timestamp DESC LIMIT 1)").bind(fk, user.username).run().catch(function () {});
      return json({ filename: fk });
    }

    // == LOGS ==
    if (method === "GET" && path === "logs") {
      var lr;
      if (isAdmin) lr = await DB.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 200").all();
      else lr = await DB.prepare("SELECT * FROM activity WHERE username=? ORDER BY timestamp DESC LIMIT 200").bind(user.username).all();
      return json((lr.results || []).map(mapLog));
    }

    // == EXPORT: CSV (admin) ==  [issue #13]
    if (method === "GET" && path === "export/csv") {
      if (!isAdmin) return err("Admin only", 403);
      var er = await DB.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 5000").all();
      var erows = er.results || [];
      function esc(v) { v = (v == null ? "" : String(v)); if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"'; return v; }
      var head = ["ID", "Timestamp (IST)", "User", "Jewelry Type", "Style", "Model", "Quality", "Status", "Cost", "Input File", "Output File", "Final File", "Error"];
      var csv = head.join(",") + "\n" + erows.map(function (l) {
        return [l.id, istFmt(l.timestamp), l.username, l.jewelry_type, l.photo_style, l.model, l.quality, l.status, l.cost_estimate, l.input_file, l.output_file, l.final_file, l.error_msg].map(esc).join(",");
      }).join("\n");
      return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="activity_log.csv"', "Access-Control-Allow-Origin": "*" } });
    }

    // == EXPORT: Images ZIP (admin) ==  [issue #13]
    // Practical cap to stay within Worker memory/time limits.
    if (method === "GET" && path === "export/images") {
      if (!isAdmin) return err("Admin only", 403);
      var CAP = 500;
      var keys = [];
      var cursor = undefined;
      do {
        var listed = await R2.list({ limit: 1000, cursor: cursor });
        for (var oi = 0; oi < listed.objects.length; oi++) {
          var ky = listed.objects[oi].key;
          if (ky === "logo.png") continue;
          keys.push(ky);
        }
        cursor = listed.truncated ? listed.cursor : null;
      } while (cursor && keys.length < CAP);
      keys = keys.slice(0, CAP);
      var zfiles = [];
      for (var zi = 0; zi < keys.length; zi++) {
        var zobj = await R2.get(keys[zi]); if (!zobj) continue;
        var zdata = new Uint8Array(await zobj.arrayBuffer());
        zfiles.push({ name: keys[zi], data: zdata });
      }
      var zip = buildZip(zfiles);
      return new Response(zip, { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="images_backup.zip"', "Access-Control-Allow-Origin": "*", "X-File-Count": String(zfiles.length) } });
    }

    // == DRIVE: Auth URL ==
    if (method === "GET" && path === "drive/auth-url") {
      if (!isAdmin) return err("Admin only", 403);
      var cid = await getS(DB, "driveClientId"); if (!cid) return err("Set Drive Client ID first");
      var redir = url.origin + "/api/drive/callback";
      return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + encodeURIComponent(cid) + "&redirect_uri=" + encodeURIComponent(redir) + "&response_type=code&scope=" + encodeURIComponent("https://www.googleapis.com/auth/drive.file") + "&access_type=offline&prompt=consent" });
    }

    // == DRIVE: Callback ==
    if (method === "GET" && path === "drive/callback") {
      var code = url.searchParams.get("code"); if (!code) return new Response("No code", { status: 400 });
      var dcid = await getS(DB, "driveClientId"), dcs = await getS(DB, "driveClientSecret"), dredir = url.origin + "/api/drive/callback";
      var dr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "code=" + code + "&client_id=" + dcid + "&client_secret=" + dcs + "&redirect_uri=" + encodeURIComponent(dredir) + "&grant_type=authorization_code" });
      var dd = await dr.json(); if (!dd.refresh_token) return new Response("No refresh token. Revoke at myaccount.google.com/permissions then retry.", { status: 400 });
      await setS(DB, "driveRefreshToken", dd.refresh_token);
      return new Response("<html><body style='font-family:Georgia,serif;text-align:center;padding:60px'><h2>Drive Connected!</h2><p>You can close this tab.</p></body></html>", { headers: { "Content-Type": "text/html" } });
    }

    // == DRIVE: Status ==
    if (method === "GET" && path === "drive/status") {
      if (!isAdmin) return err("Admin only", 403);
      return json({ connected: !!(await getS(DB, "driveRefreshToken")), lastBackup: await getS(DB, "driveLastBackup"), backupHours: (await getS(DB, "driveBackupHours")) || "2" });
    }

    // == DRIVE: Backup Now ==
    if (method === "POST" && path === "drive/backup-now") {
      if (!isAdmin) return err("Admin only", 403);
      var rt = await getS(DB, "driveRefreshToken"); if (!rt) return err("Drive not connected");
      var bcid = await getS(DB, "driveClientId"), bcs = await getS(DB, "driveClientSecret");
      var tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "refresh_token=" + rt + "&client_id=" + bcid + "&client_secret=" + bcs + "&grant_type=refresh_token" });
      var td = await tr.json(); if (!td.access_token) return err("Token refresh failed");
      var at = td.access_token;
      var fid = await getS(DB, "driveFolderId");
      if (!fid) { var fr = await fetch("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { "Authorization": "Bearer " + at, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Jewelry Marketing Agent", mimeType: "application/vnd.google-apps.folder" }) }); var ffd = await fr.json(); fid = ffd.id; await setS(DB, "driveFolderId", fid); }
      var blogs = await DB.prepare("SELECT * FROM activity ORDER BY timestamp DESC LIMIT 1000").all();
      var bcsv = "ID,Timestamp (IST),User,Type,Style,Model,Quality,Status,Cost\n";
      for (var bl of (blogs.results || [])) bcsv += [bl.id, istFmt(bl.timestamp), bl.username, bl.jewelry_type, bl.photo_style, bl.model, bl.quality, bl.status, bl.cost_estimate].join(",") + "\n";
      var bnd = "----B" + Date.now(); var meta = JSON.stringify({ name: "activity_" + new Date().toISOString().slice(0, 10) + ".csv", parents: [fid] });
      var mp = "--" + bnd + "\r\nContent-Type: application/json\r\n\r\n" + meta + "\r\n--" + bnd + "\r\nContent-Type: text/csv\r\n\r\n" + bcsv + "\r\n--" + bnd + "--";
      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { "Authorization": "Bearer " + at, "Content-Type": "multipart/related; boundary=" + bnd }, body: mp });
      await setS(DB, "driveLastBackup", new Date().toISOString());
      return json({ message: "Backup done" });
    }

    return err("Not found: " + path, 404);
  } catch (e) { return json({ error: e.message || "Server error" }, 500); }
}

// base64 from ArrayBuffer in chunks (avoids call-stack overflow on large images)
function b64FromBuf(buf) {
  var bytes = new Uint8Array(buf);
  var bin = "";
  var CH = 0x8000;
  for (var i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}
