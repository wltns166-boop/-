/**
 * TEAM TOPS — Claude AI 중계 (Google Apps Script 웹앱)
 * 병력정리·보장분석 AI가 호출하는 엔드포인트.
 * Claude API 키는 "스크립트 속성"에 보관 → 코드/깃/브라우저에 노출되지 않음.
 *
 * ── 설정 방법 ──────────────────────────────────────────────
 * 1) 구글시트(아무 시트나) → 상단 메뉴 [확장 프로그램] → [Apps Script]
 * 2) 기본 코드 지우고 이 파일 내용 전체 붙여넣기 → 저장(💾)
 * 3) 왼쪽 톱니바퀴 [프로젝트 설정] → 아래 [스크립트 속성] → [속성 추가]
 *      속성(이름): ANTHROPIC_API_KEY
 *      값        : sk-ant-... (본인 Claude API 키)
 *    → [스크립트 속성 저장]
 * 4) 오른쪽 위 [배포] → [새 배포] → 유형(톱니) [웹 앱] 선택
 *      설명        : ai proxy
 *      실행 계정   : 나
 *      액세스 권한 : 모든 사용자        ← 꼭 "모든 사용자"
 *    → [배포] → 권한 승인(본인 구글계정 허용)
 * 5) 나오는 [웹 앱 URL] (https://script.google.com/macros/s/..../exec) 복사
 *    → 이 URL을 Claude에게 전달하면 인트라넷에 연결해 드립니다.
 * ───────────────────────────────────────────────────────────
 */

function doPost(e) {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) {
      out.setContent(JSON.stringify({ error: { message: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. (스크립트 속성 확인)' } }));
      return out;
    }
    var payload = {
      model: body.model || 'claude-haiku-4-5-20251001',
      max_tokens: body.max_tokens || 4000,
      messages: [{ role: 'user', content: String(body.prompt || '') }]
    };
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    // Anthropic 응답(JSON: { content: [{ text }] })을 그대로 전달 — 프론트가 data.content 사용
    out.setContent(resp.getContentText());
    return out;
  } catch (err) {
    out.setContent(JSON.stringify({ error: { message: String((err && err.message) || err) } }));
    return out;
  }
}

function doGet() {
  return ContentService.createTextOutput('TEAM TOPS AI proxy OK');
}
