const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-a3c7.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'agentecreator123';
const SERVER_URL = process.env.SERVER_URL || 'https://agente-autonomo-production-cb49.up.railway.app';

const qrCodes = {};
const historico = {};

async function chamarIA(messages, system) {
  if (ANTHROPIC_KEY) {
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-opus-4-6', max_tokens: 1000,
      system: system, messages: messages
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });
    return r.data.content[0].text;
  } else {
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini', max_tokens: 1000, messages: msgs
    }, { headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'content-type': 'application/json' } });
    return r.data.choices[0].message.content;
  }
}

app.get('/', function(req, res) {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agente Creator - Teste</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0a0a;color:#fff;height:100vh;display:flex;flex-direction:column}
header{background:#111;padding:14px 20px;border-bottom:1px solid #222;display:flex;align-items:center;justify-content:space-between}
header h1{font-size:17px;color:#25D366;display:flex;align-items:center;gap:8px}
.badge{font-size:11px;color:#aaa;background:#1a1a1a;padding:2px 8px;border-radius:12px;border:1px solid #333}
#chat{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
.msg{max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-break:break-word}
.user{background:#005c4b;align-self:flex-end;border-bottom-right-radius:3px}
.agent{background:#1a1a2e;border:1px solid #2a2a3e;align-self:flex-start;border-bottom-left-radius:3px}
.typing{color:#666;font-style:italic}
footer{padding:12px 16px;background:#111;border-top:1px solid #222;display:flex;gap:8px;align-items:center}
input{flex:1;background:#1a1a1a;border:1px solid #333;border-radius:20px;padding:10px 16px;color:#fff;font-size:14px;outline:none}
input:focus{border-color:#25D366}
button{background:#25D366;color:#000;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:bold}
button:disabled{background:#333;cursor:not-allowed}
</style>
</head>
<body>
<header>
  <h1>🤖 Agente Creator</h1>
  <span class="badge" id="status">IA Online · GPT-4o-mini</span>
</header>
<div id="chat">
  <div class="msg agent">Olá! Sou o Agente Creator com IA. Como posso te ajudar? 👋</div>
</div>
<footer>
  <input id="inp" type="text" placeholder="Digite uma mensagem..." autocomplete="off"/>
  <button id="btn" onclick="send()">&#10148;</button>
</footer>
<script>
const chat=document.getElementById('chat');
const inp=document.getElementById('inp');
const btn=document.getElementById('btn');
const history=[];
function add(text,cls){
  const d=document.createElement('div');
  d.className='msg '+cls;
  d.textContent=text;
  chat.appendChild(d);
  chat.scrollTop=chat.scrollHeight;
  return d;
}
async function send(){
  const t=inp.value.trim();
  if(!t)return;
  inp.value='';
  btn.disabled=true;
  add(t,'user');
  history.push({role:'user',content:t});
  const loading=add('Digitando...','agent typing');
  try{
    const r=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history})});
    const d=await r.json();
    const reply=d.reply||d.error||'Erro';
    loading.className='msg agent';
    loading.textContent=reply;
    history.push({role:'assistant',content:reply});
  }catch(e){
    loading.className='msg agent';
    loading.textContent='Erro: '+e.message;
  }
  btn.disabled=false;
  inp.focus();
}
inp.addEventListener('keydown',e=>{if(e.key==='Enter')send();});
</script>
</body>
</html>`);
});

app.post('/chat', async (req, res) => {
  try {
    const messages = req.body.messages || [];
    const system = req.body.system || 'Voce e um assistente autonomo inteligente chamado Agente Creator. Responda em portugues brasileiro de forma util e direta.';
    const reply = await chamarIA(messages, system);
    res.json({ reply: reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/qr/:instancia', (req, res) => {
  const qr = qrCodes[req.params.instancia];
  res.json({ base64: qr || null, status: qr ? 'ready' : 'waiting' });
});

app.post('/instancia/criar', async (req, res) => {
  const nome = req.body.nome;
  try {
    const criar = await axios.post(EVOLUTION_URL + '/instance/create', {
      instanceName: nome, qrcode: true, integration: 'WHATSAPP-BAILEYS'
    }, { headers: { apikey: EVOLUTION_KEY } });
    const token = criar.data.hash;
    await axios.post(EVOLUTION_URL + '/webhook/set/' + nome, {
      webhook: { enabled: true, url: SERVER_URL + '/webhook/evolution', webhookByEvents: false, webhookBase64: true, events: ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE'] }
    }, { headers: { apikey: token } });
    res.json({ ok: true, token: token, instanceName: nome });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook/evolution', (req, res) => {
  const body = req.body;
  const event = body.event;
  const instance = body.instance;
  const data = body.data;
  if (event === 'qrcode.updated' && data && data.qrcode && data.qrcode.base64) {
    qrCodes[instance] = data.qrcode.base64;
  }
  if (event === 'messages.upsert') {
    const msg = data && data.messages && data.messages[0];
    if (!msg || msg.key.fromMe) return res.sendStatus(200);
    const numero = msg.key.remoteJid;
    const texto = msg.message && (msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text));
    if (!texto || !numero) return res.sendStatus(200);
    responder(instance, numero, texto);
  }
  res.sendStatus(200);
});

async function responder(instancia, numero, texto) {
  try {
    if (!historico[numero]) historico[numero] = [];
    historico[numero].push({ role: 'user', content: texto });
    const system = 'Voce e um assistente autonomo inteligente. Responda em portugues brasileiro.';
    const reply = await chamarIA(historico[numero].slice(-10), system);
    historico[numero].push({ role: 'assistant', content: reply });
    await axios.post(EVOLUTION_URL + '/message/sendText/' + instancia, { number: numero, text: reply }, { headers: { apikey: EVOLUTION_KEY } });
  } catch (err) {
    console.error('[Responder]', err.message);
  }
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, function() { console.log('Agente Creator v7 porta ' + PORT); });
