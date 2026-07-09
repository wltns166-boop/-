// ===== 처방조제 정리 — 집계 코드 (AI 아님, 100% 결정적 계산) =====
// 입력: 추출 에이전트가 표에서 그대로 옮긴 행 배열
//   [{ date:'2026-01-19', place:'봉명피보약국', kind:'처방조제', drug:'코대원에스시럽', ingredient:'ammonium chloride', days:7 }, ...]
// 규칙:
//   1) 같은 진료시작일 + 같은 기관(병·의원/약국)은 중복 입력이어도 1회 방문으로 합침
//   2) 그 방문의 "약처방 일수"는 총투약일수 칸에 적힌 값을 그대로 반영
//      - 같은 방문에 약별 일수가 다르면(예: 주사액 1일 + 내복약 7일) 가장 긴 일수를 대표값으로 사용
//        (동시에 복용하는 약이므로 방문의 처방 기간 = 가장 긴 약의 기간)

function summarizePrescriptions(rows){
  var groups = {};          // 'date|place' → {date, place, days:최대, drugs:[], rowCount}
  var order = [];           // 입력 등장 순서 유지
  (rows||[]).forEach(function(r){
    if(!r || !r.date || !r.place) return;
    var days = parseInt(r.days, 10);
    if(isNaN(days) || days < 0) days = 0;
    var key = r.date + '|' + r.place;
    if(!groups[key]){
      groups[key] = { date:r.date, place:r.place, days:days, drugs:[], rowCount:0 };
      order.push(key);
    }
    var gp = groups[key];
    gp.rowCount++;
    if(days > gp.days) gp.days = days;                    // 규칙 2: 방문 대표 일수 = 최대 총투약일수
    var dname = String(r.drug||'').trim();
    if(dname && gp.drugs.indexOf(dname) < 0) gp.drugs.push(dname);
  });
  // 날짜순 → 기관명순 정렬
  return order.map(function(k){ return groups[k]; })
    .sort(function(a,b){ return a.date===b.date ? (a.place<b.place?-1:1) : (a.date<b.date?-1:1); });
}

// 'YYYY-MM-DD' → 'YYYY년M월D일'
function fmtKoreanDate(iso){
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(iso||''));
  if(!m) return String(iso||'');
  return m[1] + '년' + (+m[2]) + '월' + (+m[3]) + '일';
}

// 사용자 요청 출력 형식: "2026년1월19일 / 봉명피보약국 / 약처방 : 7일"
function formatPrescriptionLines(summary){
  return summary.map(function(g){
    return fmtKoreanDate(g.date) + ' / ' + g.place + ' / 약처방 : ' + g.days + '일';
  });
}

if(typeof module !== 'undefined') module.exports = { summarizePrescriptions, fmtKoreanDate, formatPrescriptionLines };
