// 1회성 데이터 수정 (2026-07-30): 카톡 연동 팀원지정 정정
//  - 닉네임 '박지순 지점장' 계정 → member '박지순' 지정
//  - 그 외 member '박지순'으로 잘못 지정된 계정 → 지정 해제(빈값)
// 실행: GitHub Actions kakao-member-fix.yml (workflow_dispatch 수동 실행 전용)
// ⚠️ 토큰(rt/at)은 절대 출력하지 않는다.
const admin = require("firebase-admin");

(async () => {
  admin.initializeApp({ projectId: "team-tops-intranet" });
  const ref = admin.firestore().collection("kakao_private").doc("tokens");
  const snap = await ref.get();
  const users = (snap.exists && (snap.data() || {}).users) || {};

  const TARGET_NICK = "박지순 지점장";
  const TARGET_MEMBER = "박지순";

  const kids = Object.keys(users).filter((k) => String(users[k].nick || "") === TARGET_NICK);
  if (kids.length !== 1) {
    console.log("중단: 닉네임 '" + TARGET_NICK + "' 계정이 " + kids.length + "개입니다 (정확히 1개여야 안전).");
    Object.keys(users).forEach((k) => console.log("  -", k, "| nick:", users[k].nick || "-", "| member:", users[k].member || "(미지정)"));
    process.exit(1);
  }
  const kid = kids[0];

  const log = [];
  Object.keys(users).forEach((k) => {
    if (k !== kid && String(users[k].member || "") === TARGET_MEMBER) {
      log.push("지정 해제: nick '" + (users[k].nick || "-") + "' (" + k + ") member '" + users[k].member + "' → (미지정)");
      users[k].member = "";
    }
  });
  log.push("지정: nick '" + users[kid].nick + "' (" + kid + ") member '" + (users[kid].member || "(미지정)") + "' → '" + TARGET_MEMBER + "'");
  users[kid].member = TARGET_MEMBER;

  await ref.set({ users }, { merge: true });
  log.forEach((l) => console.log(l));

  console.log("--- 수정 후 전체 매핑 ---");
  Object.keys(users).forEach((k) => console.log("  -", k, "| nick:", users[k].nick || "-", "| member:", users[k].member || "(미지정)", "| approved:", !!users[k].approved));
  console.log("완료");
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
