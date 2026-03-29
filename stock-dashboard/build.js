#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PASSWORD = '0790';
const appHtml = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');

// Encrypt with AES-256-GCM
const salt = crypto.randomBytes(32);
const iv   = crypto.randomBytes(12);
const key  = crypto.pbkdf2Sync(PASSWORD, salt, 200000, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(appHtml, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = JSON.stringify({
  s: salt.toString('base64'),
  i: iv.toString('base64'),
  t: tag.toString('base64'),
  d: encrypted.toString('base64')
});

const loaderHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Stock Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#161b22;border:1px solid #30363d;border-radius:14px;padding:40px 36px;width:100%;max-width:380px;text-align:center}
.lock{font-size:48px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;margin-bottom:6px}
p{color:#8b949e;font-size:13px;margin-bottom:28px}
input[type=password]{width:100%;background:#0d1117;border:1px solid #30363d;color:#e6edf3;border-radius:8px;padding:12px 14px;font-size:15px;outline:none;text-align:center;letter-spacing:4px;margin-bottom:12px}
input[type=password]:focus{border-color:#58a6ff}
button{width:100%;background:#58a6ff;color:#0d1117;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}
button:hover{background:#79c0ff}
button:disabled{background:#30363d;color:#8b949e;cursor:not-allowed}
.err{color:#f85149;font-size:12px;margin-top:10px;min-height:18px}
.spin{display:inline-block;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="box">
  <div class="lock">🔒</div>
  <h1>Stock Dashboard</h1>
  <p>請輸入密碼以解鎖</p>
  <input type="password" id="pwd" placeholder="密碼" autofocus onkeydown="if(event.key==='Enter')unlock()">
  <button id="btn" onclick="unlock()">解鎖</button>
  <div class="err" id="err"></div>
</div>
<script>
const P=${payload};
function b64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function unlock(){
  const pwd=document.getElementById('pwd').value;
  if(!pwd)return;
  const btn=document.getElementById('btn');
  const err=document.getElementById('err');
  btn.disabled=true;
  btn.innerHTML='<span class="spin">⟳</span> 解鎖中...';
  err.textContent='';
  try{
    const enc=new TextEncoder();
    const km=await crypto.subtle.importKey('raw',enc.encode(pwd),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:b64(P.s),iterations:200000,hash:'SHA-256'},
      km,{name:'AES-GCM',length:256},false,['decrypt']
    );
    const iv=b64(P.i);
    const data=b64(P.d);
    const tag=b64(P.t);
    const ct=new Uint8Array(data.length+tag.length);
    ct.set(data);ct.set(tag,data.length);
    const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
    const html=new TextDecoder().decode(pt);
    sessionStorage.setItem('__sk',pwd);
    document.open();document.write(html);document.close();
  }catch(e){
    err.textContent='密碼錯誤，請重試';
    btn.disabled=false;
    btn.textContent='解鎖';
    document.getElementById('pwd').value='';
    document.getElementById('pwd').focus();
  }
}
</script>
</body>
</html>`;

const outPath = path.join(__dirname, '..', 'index.html');
fs.writeFileSync(outPath, loaderHtml, 'utf8');
console.log('✅ Generated index.html (' + (loaderHtml.length / 1024).toFixed(1) + ' KB)');
console.log('   Password: ' + PASSWORD);
console.log('   Output:   ' + outPath);
