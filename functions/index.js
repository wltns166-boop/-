const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

exports.anthropicProxy = onRequest(
  {
    region: 'us-central1',
    secrets: [ANTHROPIC_API_KEY],
    cors: true,
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'POST only' } });
      return;
    }
    try {
      const body = req.body || {};
      const prompt = body.prompt;
      if (!prompt) {
        res.status(400).json({ error: { message: 'prompt is required' } });
        return;
      }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: body.model || 'claude-haiku-4-5-20251001',
          max_tokens: body.max_tokens || 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      res.status(r.status).json(data);
    } catch (e) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
);
