/**
 * TEAM TOPS — 처리결과 구글드라이브 자동 저장 (Google Apps Script 웹앱)
 *
 * 고객등록 · DB배정현황 · 병력정리 · 보장분석 데이터를
 * "중앙 공용 구글시트 1개"에 시트(탭)별로 저장한다.
 * index.html 의 _driveSync() 가 데이터 변경 시마다 이 웹앱으로 POST 하고,
 * 이 스크립트는 해당 탭을 "전체 최신 내용으로 덮어쓰기"(최신화) 한다.
 *
 * ── 설정 방법 ─────────────────────────────────────────────
 * 1) script.google.com 접속 → [새 프로젝트]
 * 2) 기본 코드 전체 지우고, 이 파일 내용 전체 붙여넣기 → 저장(💾)
 * 3) (선택) 아래 ROOT_FOLDER_NAME / SPREADSHEET_NAME 을 원하는 이름으로 수정
 * 4) 오른쪽 위 [배포] → [새 배포] → 톱니바퀴(유형) → [웹 앱] 선택
 *      설명        : drive sync
 *      실행 계정   : 나
 *      액세스 권한 : 모든 사용자          ← 꼭 "모든 사용자"
 *    → [배포] → 권한 승인(본인 구글계정 허용)
 * 5) 나오는 [웹 앱 URL] (https://script.google.com/macros/s/..../exec) 복사
 *    → 이 URL 을 Claude 에게 전달하면 인트라넷에 연결해 드립니다.
 *
 * ※ 처음 한 번 POST 가 오면 본인 구글드라이브에
 *    "TEAM TOPS 자료" 폴더와 "TEAM TOPS 데이터" 시트가 자동 생성됩니다.
 *    이 시트가 곧 팀 공용 저장본입니다. (사장님 드라이브 한 곳에 모임)
 * ──────────────────────────────────────────────────────────
 */

var ROOT_FOLDER_NAME = 'TEAM TOPS 자료';     // 드라이브 폴더 이름
var SPREADSHEET_NAME = 'TEAM TOPS 데이터';    // 구글시트 파일 이름
var MAX_CELL = 45000;                        // 셀 최대 글자수(초과분 자름)

function doPost(e) {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 보험금 청구 파일 저장 (팀원별 폴더)
    if (body.action === 'claimFile') { return _saveClaimFile(body, out); }

    var sheetName = String(body.sheet || '').trim();
    if (!sheetName) { out.setContent(JSON.stringify({ error: 'sheet name required' })); return out; }

    var headers = body.headers || [];
    var rows = body.rows || [];

    var ss = _getSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) sh = ss.insertSheet(sheetName);
    sh.clear();

    // 헤더 + 행 데이터를 2차원 배열로 구성
    var data = [];
    if (headers.length) data.push(headers.map(_cell));
    for (var i = 0; i < rows.length; i++) {
      data.push((rows[i] || []).map(_cell));
    }

    if (data.length) {
      // 모든 행을 가장 넓은 열 수에 맞춤
      var w = 0;
      for (var j = 0; j < data.length; j++) w = Math.max(w, data[j].length);
      for (var j2 = 0; j2 < data.length; j2++) {
        while (data[j2].length < w) data[j2].push('');
      }
      sh.getRange(1, 1, data.length, w).setValues(data);
      if (headers.length) {
        sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e8eaf6');
        sh.setFrozenRows(1);
      }
    }
    // 마지막 갱신 시각 기록(시트 우상단 메모용 — 별도 셀 아님, 로그)
    out.setContent(JSON.stringify({ ok: true, sheet: sheetName, rows: rows.length, url: ss.getUrl() }));
    return out;
  } catch (err) {
    out.setContent(JSON.stringify({ error: String((err && err.message) || err) }));
    return out;
  }
}

function doGet() {
  var ss = _getSpreadsheet();
  return ContentService.createTextOutput('TEAM TOPS Drive sync OK\n' + ss.getUrl());
}

// 셀 값 정규화: 문자열화 + 길이 제한
function _cell(c) {
  c = (c == null) ? '' : String(c);
  if (c.length > MAX_CELL) c = c.substring(0, MAX_CELL) + '…(생략)';
  return c;
}

// 중앙 공용 스프레드시트 가져오기(없으면 생성, ID는 스크립트 속성에 저장)
function _getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 삭제됨 → 재생성 */ }
  }
  var folder = _getFolder();
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  var file = DriveApp.getFileById(ss.getId());
  // 루트에서 지정 폴더로 이동
  try { folder.addFile(file); DriveApp.getRootFolder().removeFile(file); } catch (e) {}
  // 기본 'Sheet1' 빈 탭은 그대로 두어도 무방
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

// 저장 폴더 가져오기(없으면 생성)
function _getFolder() {
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

// 하위 폴더 가져오기(없으면 생성)
function _getChildFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

// 보험금 청구 PDF 저장: 보험금청구 / {팀원이름} / {폴더명} / {파일명}
function _saveClaimFile(body, out) {
  var member   = String(body.member || '미지정').trim() || '미지정';
  var folder   = String(body.folder || '보험금청구').trim() || '보험금청구';
  var fileName = String(body.filename || 'file.pdf').trim() || 'file.pdf';
  var b64      = body.b64 || '';
  if (!b64) { out.setContent(JSON.stringify({ error: 'b64 required' })); return out; }

  var root      = _getFolder();
  var claimRoot = _getChildFolder(root, '보험금청구');
  var memberF   = _getChildFolder(claimRoot, member);
  var subF      = _getChildFolder(memberF, folder);

  // 같은 이름 파일이 있으면 휴지통으로(덮어쓰기 효과)
  var ex = subF.getFilesByName(fileName);
  while (ex.hasNext()) ex.next().setTrashed(true);

  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
  var f = subF.createFile(blob);
  out.setContent(JSON.stringify({ ok: true, file: fileName, url: f.getUrl() }));
  return out;
}
