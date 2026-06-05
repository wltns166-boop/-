/**
 * DB 배정 알림톡 발송 서버 (솔라피/SOLAPI)
 * ───────────────────────────────────────────
 * 인트라넷에서 DB를 배정하면 이 서버의 /api/kakao/send 로 요청이 오고,
 * 솔라피를 통해 배정된 팀원에게 카카오 알림톡을 발송합니다.
 *
 * 실행: npm install  →  npm start
 * 설정값은 .env 파일에 채워 넣으세요 (.env.example 참고).
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { SolapiMessageService } = require('solapi');

const {
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SENDER_PHONE,        // 솔라피에 등록·인증한 발신번호 (알림톡 실패 시 문자 대체발송용)
  KAKAO_PFID,          // 카카오 발신 프로필 ID (KA01PF...)
  KAKAO_TEMPLATE_ID,   // 승인받은 템플릿 ID (KA01TP...)
  ALLOW_ORIGIN = '*',  // 인트라넷이 호스팅되는 주소 (보안상 정확히 지정 권장)
  PORT = 3000,
} = process.env;

if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET) {
  console.error('⚠️  .env 에 SOLAPI_API_KEY / SOLAPI_API_SECRET 를 설정하세요.');
}

const messageService = new SolapiMessageService(SOLAPI_API_KEY, SOLAPI_API_SECRET);

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN }));
app.use(express.json());

/**
 * 알림톡 발송
 * body: { to: "01012345678", variables: { "#{이름}": "김철수", ... } }
 */
app.post('/api/kakao/send', async (req, res) => {
  const { to, variables } = req.body || {};
  if (!to) return res.status(400).json({ ok: false, error: '수신번호(to)가 없습니다.' });

  try {
    const result = await messageService.sendOne({
      to: String(to).replace(/[^0-9]/g, ''),  // 숫자만 (010-1234-5678 -> 01012345678)
      from: SENDER_PHONE,
      kakaoOptions: {
        pfId: KAKAO_PFID,
        templateId: KAKAO_TEMPLATE_ID,
        variables: variables || {},
        // disableSms: true,  // 알림톡 실패 시 문자(SMS/LMS) 대체발송을 끄려면 주석 해제
      },
    });
    console.log('[알림톡 발송 성공]', to, result?.statusCode || '');
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[알림톡 발송 실패]', err?.message || err);
    res.status(500).json({ ok: false, error: err?.message || '발송 실패' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ 알림톡 서버 실행 중: http://localhost:${PORT}`));
