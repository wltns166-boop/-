// TEAM TOPS — AI API 중계 함수 (구글 Gemini / Anthropic Claude)
// 프론트엔드(index.html)의 보장분석 기능이 호출하는 /api/analyze 엔드포인트.
// API 키를 브라우저에 노출하지 않기 위해 서버(Cloud Functions)에서 중계한다.
// 모델 이름으로 분기: "gemini-*" → 구글 Gemini, "claude-*" → Anthropic Claude.
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

// Firebase 시크릿에 저장한 API 키
//   설정: firebase functions:secrets:set GEMINI_API_KEY   (구글 AI Studio 키)
//        firebase functions:secrets:set ANTHROPIC_API_KEY (선택: 클로드도 쓸 때)
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.api = onRequest(
  { secrets: [GEMINI_API_KEY, ANTHROPIC_API_KEY], region: "us-central1", memory: "256MiB", timeoutSeconds: 120 },
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

    // ── 웹 푸시 알림 전송 (body.push) ──────────────────────────
    //   to: "ALL" | "ADMIN" | [이름,...]  →  push_tokens 컬렉션에서 토큰 조회 후 FCM 발송.
    if (body.push) {
      try {
        const to = body.to;
        const title = String(body.title || "TEAM TOPS");
        const text = String(body.body || "");
        const link = String(body.link || "/");
        const col = admin.firestore().collection("push_tokens");
        let docs = [];
        if (to === "ALL") {
          docs = (await col.get()).docs;
        } else if (to === "ADMIN") {
          docs = (await col.where("admin", "==", true).get()).docs;
        } else if (Array.isArray(to)) {
          const names = to.filter(Boolean);
          const seen = {};
          for (let i = 0; i < names.length; i += 10) {
            const chunk = names.slice(i, i + 10);
            const s = await col.where("name", "in", chunk).get();
            s.docs.forEach((d) => { if (!seen[d.id]) { seen[d.id] = 1; docs.push(d); } });
          }
        }
        const tokens = docs.map((d) => d.id);
        if (!tokens.length) { res.status(200).json({ ok: true, sent: 0 }); return; }
        const resp = await admin.messaging().sendEachForMulticast({
          tokens: tokens,
          data: { title: title, body: text, link: link },
          webpush: { headers: { Urgency: "high" }, fcmOptions: { link: link } }
        });
        // 만료/무효 토큰 정리
        const dels = [];
        resp.responses.forEach((r, i) => {
          if (!r.success) {
            const code = (r.error && r.error.code) || "";
            if (/not-registered|invalid-argument|invalid-registration/.test(code)) {
              dels.push(col.doc(tokens[i]).delete().catch(() => {}));
            }
          }
        });
        await Promise.all(dels);
        res.status(200).json({ ok: true, sent: resp.successCount, failed: resp.failureCount });
      } catch (e) {
        console.error("push error:", e);
        res.status(500).json({ error: { message: String((e && e.message) || e) } });
      }
      return;
    }

    const model = body.model || "gemini-2.0-flash";
    const maxTokens = body.max_tokens || 4000;
    const prompt = body.prompt || "";
    if (!prompt) { res.status(400).json({ error: { message: "prompt is required" } }); return; }

    // ── 구글 Gemini 분기 (model 이 "gemini-*") ──────────────────
    //   응답을 Anthropic과 같은 형태 { content:[{text}] } 로 정규화 → 프론트는 그대로 사용.
    if (/^gemini/i.test(model)) {
      try {
        const gUrl = "https://generativelanguage.googleapis.com/v1beta/models/"
          + encodeURIComponent(model) + ":generateContent?key=" + GEMINI_API_KEY.value();
        const r = await fetch(gUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0 }
          })
        });
        const data = await r.json();
        if (!r.ok) {
          const msg = (data && data.error && data.error.message) || ("Gemini 오류 " + r.status);
          res.status(r.status).json({ error: { message: msg } });
          return;
        }
        let text = "";
        try {
          const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
          text = parts.map(function (p) { return (p && p.text) || ""; }).join("");
        } catch (e) { text = ""; }
        res.status(200).json({ content: [{ type: "text", text: text }] });
      } catch (e) {
        console.error("gemini proxy error:", e);
        res.status(500).json({ error: { message: String((e && e.message) || e) } });
      }
      return;
    }

    // ── Anthropic Claude 분기 (model 이 "claude-*") ─────────────
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
