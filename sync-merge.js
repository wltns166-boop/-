/* ═══════════════════════════════════════════════════════════
   InsureNet 동시 편집 병합 (3-way merge)
   - 서버(Node)와 브라우저가 같은 규칙으로 데이터를 합칩니다.
   - base   : 내가 마지막으로 서버에서 받은 값 (편집 시작점)
     local  : 내가 편집한 값
     remote : 지금 서버에 있는 값 (다른 사람 변경 포함)
   - 서로 다른 항목을 고친 경우 양쪽 변경이 모두 남습니다.
   - 같은 항목의 같은 칸을 동시에 고친 경우에만 나중 저장이 이깁니다.
═══════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyncMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* 키 순서와 무관하게 같은 값이면 같은 문자열 */
  function stable(v) {
    if (v === undefined) return undefined;
    if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : stable(x))).join(',') + ']';
    if (isObj(v)) {
      return '{' + Object.keys(v).sort()
        .filter((k) => v[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  function eq(a, b) { return stable(a) === stable(b); }

  /* 모든 원소가 id를 가진 레코드 목록인지 (고객, 청구, 공지 등) */
  function isIdList(arr) {
    return arr.every((x) => isObj(x) && x.id !== undefined && x.id !== null);
  }
  function idKey(x) { return JSON.stringify(x.id); }

  /* id 기준 병합: 추가/수정/삭제를 레코드 단위로 반영 */
  function mergeById(base, local, remote) {
    const bm = new Map(base.map((x) => [idKey(x), x]));
    const lm = new Map(local.map((x) => [idKey(x), x]));
    const out = [];
    const placed = new Set();

    // 서버 순서를 기준으로 시작
    for (const r of remote) {
      const k = idKey(r);
      if (lm.has(k)) {
        out.push(merge3(bm.get(k), lm.get(k), r));
        placed.add(k);
      } else if (!bm.has(k)) {
        out.push(r);                // 다른 사람이 새로 추가
        placed.add(k);
      }
      // bm에 있고 lm에 없으면 내가 삭제한 것 → 제외
    }

    // 내가 새로 추가한 항목을 내 목록에서의 위치 그대로 끼워 넣음
    let lastKey = null;
    for (const l of local) {
      const k = idKey(l);
      if (placed.has(k)) { lastKey = k; continue; }
      if (bm.has(k)) continue;      // 다른 사람이 삭제한 항목 → 제외
      const at = lastKey === null ? 0 : out.findIndex((x) => idKey(x) === lastKey) + 1;
      out.splice(at, 0, l);
      placed.add(k);
      lastKey = k;
    }
    return out;
  }

  /* id 없는 목록(채팅 메시지, 일정 등): 내가 추가/삭제한 원소만 서버 목록에 반영 */
  function mergeMultiset(base, local, remote) {
    const count = (arr) => {
      const m = new Map();
      for (const x of arr) { const s = stable(x); m.set(s, (m.get(s) || 0) + 1); }
      return m;
    };
    const bc = count(base), lc = count(local);
    const out = remote.slice();

    for (const [s, n] of bc) {
      let removed = n - (lc.get(s) || 0);
      for (let i = out.length - 1; i >= 0 && removed > 0; i--) {
        if (stable(out[i]) === s) { out.splice(i, 1); removed--; }
      }
    }
    const seen = new Map();
    for (const x of local) {
      const s = stable(x);
      const k = (seen.get(s) || 0) + 1;
      seen.set(s, k);
      if (k > (bc.get(s) || 0)) out.push(x);
    }
    return out;
  }

  function merge3(base, local, remote) {
    if (eq(local, base)) return remote;    // 나는 안 바꿈 → 서버 값
    if (eq(remote, base)) return local;    // 서버는 안 바뀜 → 내 값
    if (eq(local, remote)) return local;

    if (Array.isArray(local) && Array.isArray(remote)) {
      const b = Array.isArray(base) ? base : [];
      if (isIdList(local) && isIdList(remote) && isIdList(b)) return mergeById(b, local, remote);
      return mergeMultiset(b, local, remote);
    }

    if (isObj(local) && isObj(remote)) {
      const b = isObj(base) ? base : {};
      const out = {};
      const keys = new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(b)]);
      for (const k of keys) {
        const v = merge3(b[k], local[k], remote[k]);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }

    return local;                          // 같은 칸 동시 수정 → 나중 저장 우선
  }

  return { merge3, eq };
});
