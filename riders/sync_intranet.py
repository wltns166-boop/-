"""riders.json 을 인트라넷(insurance-intranet-v2.html)과 특약 가이드(README.md)에 반영한다.

사용법:  python3 riders/sync_intranet.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
data = json.load(open(os.path.join(HERE, "riders.json"), encoding="utf-8"))

# 1) 인트라넷: 화면에 필요한 필드만 넣는다 (내레이션 대본 제외)
slim = {
    "meta": {"disclaimer": data["meta"]["disclaimer"]},
    "categories": [
        {k: c[k] for k in ("id", "no", "title", "icon", "color", "summary")} | {
            "riders": [{k: r[k] for k in ("name", "oneLine", "desc", "points", "example", "tip", "story")}
                       | {"visual": {k: v for k, v in r["visual"].items() if k != "say"}}
                       for r in c["riders"]]}
        for c in data["categories"]
    ],
}
html_path = os.path.join(ROOT, "insurance-intranet-v2.html")
html = open(html_path, encoding="utf-8").read()
block = "/* RIDERS:BEGIN */\nconst RIDERS = " + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";\n/* RIDERS:END */"
html, n = re.subn(r"/\* RIDERS:BEGIN \*/.*?/\* RIDERS:END \*/", lambda m: block, html, flags=re.S)
assert n == 1, "RIDERS 마커를 찾지 못했습니다"
open(html_path, "w", encoding="utf-8").write(html)

# 2) 특약 가이드 문서
total = sum(len(c["riders"]) for c in data["categories"])
L = [f"# {data['meta']['title']}", "",
     f"보험사에서 많이 판매하는 주요 특약 **{total}종**을 8개 분야로 나눠, 쉽고 짧게 정리했습니다.",
     "분야마다 교육 영상(약 3~5분)이 함께 있습니다.", "",
     f"> ⚠️ {data['meta']['disclaimer']}", "",
     "## 한눈에 보는 특약 리스트", "",
     "| 분야 | 특약 | 한 줄 설명 |", "|---|---|---|"]
for c in data["categories"]:
    for r in c["riders"]:
        L.append(f"| {c['icon']} {c['title']} | **{r['name']}** | {r['oneLine']} |")
L += ["", "## 교육 영상", "", "| EP | 주제 | 다루는 특약 | 파일 |", "|---|---|---|---|"]
for c in data["categories"]:
    f = f"{c['no']:02d}-{c['id']}.mp4"
    L.append(f"| {c['no']:02d} | {c['icon']} {c['title']} | {', '.join(r['name'] for r in c['riders'])} | [videos/{f}](videos/{f}) |")
L += ["", "인트라넷에서는 왼쪽 메뉴 **🎓 특약 교육**에서 바로 볼 수 있습니다.", ""]
for c in data["categories"]:
    L += [f"## {c['no']}. {c['icon']} {c['title']}", "", f"_{c['summary']}_", ""]
    if c.get("journey"):
        L += [f"**{c['journey']['title']}**", "", " → ".join(f"{s_['icon']} {s_['label']} ({s_['rider']})" for s_ in c["journey"]["steps"]), ""]
    for r in c["riders"]:
        L += [f"### {r['name']}", "", f"**{r['oneLine']}**", "", r["desc"], ""]
        L += [f"- {p}" for p in r["points"]]
        L += ["", "🖼️ " + " → ".join(f"{a} {b}" for a, b in r["story"]), ""]
        v = r["visual"]
        L += [f"**{v['title']}**", ""]
        if v["type"] == "treat":
            L += [f"- {it['icon']} **{it['name']}** — {it['text']}" for it in v["items"]]
        elif v["type"] == "check":
            L += [f"- {dict(y='✅', n='❌', m='🔺 상품마다')[it['ok']]} {it['label']}" for it in v["items"]]
        elif v["type"] == "flow":
            L += [" → ".join(f"{it['icon']} {it['label']}({it['sub']})" for it in v["items"])]
        elif v["type"] == "timeline":
            L += [" → ".join(f"{it['label']}: **{it['text']}**" for it in v["items"])]
        else:
            L += [f"- {it['label']}: {'█' * max(1, round(it['value'] / 10))} {it['text']}" for it in v["items"]]
        L += ["", f"📌 **이럴 때 받아요** — {r['example']}  ", f"💡 **상담 포인트** — {r['tip']}", ""]
    L += ["**핵심 정리**", ""] + [f"{i}. {t}" for i, t in enumerate(c["takeaways"], 1)] + [""]
L += ["---", "", "## 영상 다시 만들기", "",
      "내용은 `riders.json` 한 곳에서 관리합니다. 수정 후 아래 명령으로 문서·인트라넷·영상을 갱신하세요.", "",
      "```bash", "python3 riders/sync_intranet.py", "```", "",
      "```bash", "pip install edge-tts numpy && riders/video/build_all.sh /tmp/rider-work", "```", "",
      "- 내레이션: Microsoft Edge 신경망 음성(ko-KR-SunHiNeural)",
      "- 화면: `video/template.html`을 Playwright(Chromium)로 프레임 단위 렌더링 → ffmpeg로 1080p 30fps MP4 인코딩",
      "- 글꼴: Pretendard (SIL Open Font License)", ""]
open(os.path.join(HERE, "README.md"), "w", encoding="utf-8").write("\n".join(L))
print(f"인트라넷·README 갱신 완료: 특약 {total}종")
