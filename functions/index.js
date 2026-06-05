// TEAM TOPS — Claude API 중계 함수
// 프론트엔드(index.html)의 보장분석 기능이 호출하는 /api/analyze 엔드포인트.
// API 키를 브라우저에 노출하지 않기 위해 서버(Cloud Functions)에서 중계한다.
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

// Firebase 시크릿에 저장한 Anthropic API 키
//   설정: firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.api = onRequest(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", memory: "256MiB", timeoutSeconds: 120 },
  async (req, res) => {
    // 호스팅 rewrite로 같은 도메인에서 호출되므로 CORS는 기본적으로 불필요하지만 방어적으로 허용
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: { message: "POST only" } }); return; }

    var body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    // 드라이브(앱스크립트) 프록시 — 브라우저는 CORS로 앱스크립트 응답을 못 읽으므로
    // 같은 도메인의 이 함수가 대신 호출해 JSON을 그대로 돌려준다.
    if (body.driveProxy) {
      const target = String(body.url || "");
      let host = "";
      try { const u = new URL(target); if (u.protocol === "https:") host = u.hostname; } catch (e) {}
      if (host !== "script.google.com") {
        res.status(400).json({ error: { message: "invalid drive url" } });
        return;
      }
      try {
        const r = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body.payload || {}),
          redirect: "follow"
        });
        const txt = await r.text();
        let j; try { j = JSON.parse(txt); } catch (e) { j = { raw: txt.slice(0, 500) }; }
        res.status(200).json(j);
      } catch (e) {
        res.status(500).json({ error: { message: String((e && e.message) || e) } });
      }
      return;
    }

    const model = body.model || "claude-haiku-4-5-20251001";
    const maxTokens = body.max_tokens || 4000;
    const prompt = body.prompt || "";
    if (!prompt) { res.status(400).json({ error: { message: "prompt is required" } }); return; }

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await r.json();
      // Anthropic 응답({ content: [{ text }] })을 그대로 전달 — 프론트가 data.content를 사용
      res.status(r.status).json(data);
    } catch (e) {
      console.error("anthropic proxy error:", e);
      res.status(500).json({ error: { message: String((e && e.message) || e) } });
    }
  }
);
