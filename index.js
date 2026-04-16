// agente creator v5
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution-api-production-a3c7.up.railway.app';
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'agentecreator123';
const SERVER_URL = process.env.SERVER_URL || 'https://agente-autonomo-production-cb49.up.railway.app';

const qrCodes = {};
const historico = {};

app.post('/webhook/evolution', (req, res) => {
  const body = req.body;
  const event = body.event;
  const instance = body.instance;
  const data = body.data;
  console.log('[Webhook] ' + event + ' - ' + instance);
  if (event === 'qrcode.updated' && data && data.qrcode && data.qrcode.base64) {
    qrCodes[instance] = data.qrcode.base64;
  }
  if (event === 'messages.upsert') {
    const msg = data && data.messages && data.messages[0];
    if (!msg || msg.key.fromMe) return res.sendStatus(200);
    const numero = msg.key.remoteJid;
    const texto = (msg.message && (msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text)));
    if (!texto || !numero) return res.sendStatus(200);
    responder(instance, numero, texto);
  }
  res.sendStatus(200);
});

app.post('/chat', async (req, res) => {
  try {
    const messages = req.body.messages;
    const system = req.body.system || 'Voce e um assistente autonomo. Responda em portugues.';
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: system,
      messages: messages
    }, { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });
    res.json({ reply: r.data.content[0].text });
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

async function responder(instancia, numero, texto) {
  try {
    if (!historico[numero]) historico[numero] = [];
    historico[numero].push({ role: 'user', content: texto });
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: 'Voce e um assistente autonomo inteligente. Responda em portugues brasileiro.',
      messages: historico[numero].slice(-10)
    }, { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });
    const resposta = r.data.content[0].text;
    historico[numero].push({ role: 'assistant', content: resposta });
    await axios.post(EVOLUTION_URL + '/message/sendText/' + instancia, { number: numero, text: resposta }, { headers: { apikey: EVOLUTION_KEY } });
  } catch (err) {
    console.error('[Responder]', err.message);
  }
}

app.get('/', function(req, res) { res.json({ status: 'Agente Creator v5 online' }); });

const PORT = process.env.PORT || 8080;
app.listen(PORT, function() { console.log('Servidor v5 na porta ' + PORT); });
