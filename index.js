const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const EVO = (process.env.EVOLUTION_URL || 'https://evolution-api-production-a3c7.up.railway.app').replace(/\/+$/, '');
const EVO_KEY = process.env.EVOLUTION_KEY || 'agentecreator123';
const SERVER_URL = (process.env.SERVER_URL || 'https://agente-autonomo-production-cb49.up.railway.app').replace(/\/+$/, '');
const INST = 'agente1';

const connStore = {}; // status por instancia
const historico = {};

console.log('[v11] EVO:', EVO);

async function chamarIA(messages, system) {
  if (ANTHROPIC_KEY) {
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-opus-4-6', max_tokens: 1000, system, messages
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });
    return r.data.content[0].text;
  }
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const r = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini', max_tokens: 1000, messages: msgs
  }, { headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'content-type': 'application/json' } });
  return r.data.choices[0].message.content;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/chat', async (req, res) => {
  try {
    const reply = await chamarIA(req.body.messages || [],
      req.body.system || 'Voce e um assistente autonomo chamado Agente Creator. Responda em portugues.');
    res.json({ reply });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET QR/status por instancia
app.get('/qr/:inst', async (req, res) => {
  const inst = req.params.inst;
  if (connStore[inst] === 'connected') return res.json({ status: 'connected' });
  // Verificar status direto na Evolution API
  try {
    const r = await axios.get(EVO + '/instance/connectionState/' + inst, {
      headers: { apikey: EVO_KEY }, timeout: 5000
    });
    const state = r.data && r.data.instance && r.data.instance.state;
    if (state === 'open') {
      connStore[inst] = 'connected';
      return res.json({ status: 'connected' });
    }
    res.json({ status: state || 'waiting' });
  } catch (e) {
    res.json({ status: 'waiting' });
  }
});

// POST /pairing-code - conectar via numero de telefone (sem QR, sem VPS!)
app.post('/pairing-code', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return res.status(400).json({ error: 'Numero invalido' });

  try {
    // 1. Deletar instancia antiga se existir
    try {
      await axios.delete(EVO + '/instance/logout/' + INST, { headers: { apikey: EVO_KEY } });
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) {}
    try {
      await axios.delete(EVO + '/instance/delete/' + INST, { headers: { apikey: EVO_KEY } });
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) {}

    // 2. Criar instancia SEM qrcode (vai usar pairing code)
    const criar = await axios.post(EVO + '/instance/create', {
      instanceName: INST,
      qrcode: false,
      integration: 'WHATSAPP-BAILEYS'
    }, { headers: { apikey: EVO_KEY } });

    console.log('[Criar]', JSON.stringify(criar.data).substring(0, 200));
    await new Promise(r => setTimeout(r, 2000));

    // 3. Configurar webhook
    try {
      await axios.post(EVO + '/webhook/set/' + INST, {
        webhook: {
          enabled: true,
          url: SERVER_URL + '/webhook/evolution',
          webhookByEvents: false,
          webhookBase64: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
        }
      }, { headers: { apikey: EVO_KEY } });
    } catch(e) { console.log('[Webhook err]', e.message); }

    // 4. Solicitar pairing code
    const pairingResp = await axios.post(EVO + '/instance/pairingCode/' + INST,
      { number: phone },
      { headers: { apikey: EVO_KEY }, timeout: 15000 }
    );

    console.log('[PairingCode]', JSON.stringify(pairingResp.data));
    const code = pairingResp.data && (pairingResp.data.code || pairingResp.data.pairingCode);

    if (code) {
      connStore[INST] = 'pairing';
      res.json({ code: code, instance: INST });
    } else {
      res.status(500).json({ error: 'Codigo nao retornado: ' + JSON.stringify(pairingResp.data) });
    }
  } catch (err) {
    console.error('[PairingCode err]', err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ error: err.response ? JSON.stringify(err.response.data) : err.message });
  }
});

// Webhook da Evolution API
app.post('/webhook/evolution', (req, res) => {
  const { event, instance, data } = req.body;
  console.log('[Webhook]', event, instance);
  if (event === 'connection.update' && data && (data.state === 'open' || data.status === 'open')) {
    connStore[instance] = 'connected';
    console.log('[Connected!]', instance);
  }
  if (event === 'messages.upsert') {
    const msg = data && data.messages && data.messages[0];
    if (!msg || msg.key.fromMe) return res.sendStatus(200);
    const numero = msg.key.remoteJid;
    const texto = msg.message && (
      msg.message.conversation ||
      (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text)
    );
    if (texto && numero) responder(instance, numero, texto);
  }
  res.sendStatus(200);
});

async function responder(inst, numero, texto) {
  try {
    if (!historico[numero]) historico[numero] = [];
    historico[numero].push({ role: 'user', content: texto });
    const reply = await chamarIA(historico[numero].slice(-10),
      'Voce e um assistente autonomo chamado Agente Creator. Responda em portugues de forma util e direta.');
    historico[numero].push({ role: 'assistant', content: reply });
    await axios.post(EVO + '/message/sendText/' + inst,
      { number: numero, text: reply },
      { headers: { apikey: EVO_KEY } });
    console.log('[Responder OK]', numero.substring(0,10));
  } catch (err) { console.error('[Responder err]', err.message); }
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('[Agente Creator v11 - Pairing Code] Porta', PORT));
