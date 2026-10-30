"""특약 교육 영상: 장면 구성 + 한국어 내레이션(TTS) 생성.

riders.json 을 읽어 영상별 장면(scene) 목록과 문장 단위 타이밍을 만들고,
문장마다 음성을 합성해 영상 전체 내레이션 트랙(narration.wav)을 만든다.

사용법:  python3 build_audio.py <출력폴더> [카테고리id ...]
"""
import asyncio
import json
import os
import subprocess
import sys

import certifi

# 사내 프록시 환경에서는 시스템 CA 번들을 써야 TLS 검증이 통과된다.
if os.path.exists("/root/.ccr/ca-bundle.crt"):
    certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
import edge_tts  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "riders.json")
VOICE = "ko-KR-SunHiNeural"
RATE = "+4%"
SR = 48000

GAP = 0.45        # 문장 사이 쉼
LEAD_IN = 0.7     # 장면 시작 후 첫 문장까지
TAIL = 1.1        # 마지막 문장 후 다음 장면까지
QUIZ_THINK = 3.0  # 퀴즈 정답 공개 전 생각할 시간

# 내레이션은 읽기 쉬운 한글 발음으로 쓰고, 자막에는 숫자·기호로 보여 준다.
CAPTION_FIX = [
    ("I 육십부터 육십구까지", "I60~I69"),
    ("I 육십부터 육십삼, 그리고 육십오와 육십육", "I60~I63, I65~I66"),
    ("I 육십부터 육십이까지", "I60~I62"),
    ("I 이십부터 이십오까지", "I20~I25"),
    ("I 이십일부터 이십삼까지", "I21~I23"),
    ("일종에서 오종", "1~5종"), ("일종부터 오종까지", "1종부터 5종까지"), ("일종부터 칠종까지", "1종부터 7종까지"),
    ("일급부터 십사급까지", "1급부터 14급까지"), ("십사급", "14급"), ("일급이", "1급이"),
    ("씨디알 일 점", "CDR 1점"), ("씨디알 점수", "CDR 점수"), ("씨디알 ", "CDR "), ("일 점은", "1점은"),
    ("이 점은", "2점은"), ("삼 점 이상", "3점 이상"),
    ("십에서 이십 퍼센트", "10~20%"), ("삼 퍼센트부터 백 퍼센트", "3%부터 100%"),
    ("삼십 퍼센트", "30%"), ("이십 퍼센트", "20%"), ("오십 퍼센트", "50%"), ("십 퍼센트", "10%"), ("백 퍼센트", "100%"),
    ("오천만 원", "5천만 원"), ("이천만 원", "2천만 원"), (" 천만 원", " 1천만 원"), ("이십 일 입원", "20일 입원"), ("일억 원", "1억 원"),
    ("삼십만 원", "30만 원"), ("십만 원", "10만 원"), ("칠만 원", "7만 원"), ("삼만 원", "3만 원"),
    ("구십 일", "90일"), ("이십 일분", "20일분"), ("팔십 세", "80세"), ("전치 팔 주", "전치 8주"),
    ("오 년 차", "5년 차"), ("사세대", "4세대"), ("삼대 ", "3대 "), ("한 번분", "1회분"),
]


def caption(text):
    for a, b in CAPTION_FIX:
        text = text.replace(a, b)
    return text


def build_scenes(cat, idx, total):
    scenes = [{"type": "intro", "say": cat["intro"]}]
    n = len(cat["riders"])
    for i, r in enumerate(cat["riders"]):
        scenes.append({"type": "rider", "rider": r, "pos": i + 1, "count": n, "say": r["say"]})
    scenes.append({"type": "compare", "compare": cat["compare"], "say": cat["compare"]["say"]})
    scenes.append({"type": "quiz", "quiz": cat["quiz"], "say": cat["quiz"]["say"]})
    scenes.append({
        "type": "summary",
        "takeaways": cat["takeaways"],
        "say": [
            "오늘 배운 내용을 정리해 볼게요.",
            "화면의 세 가지 핵심만 기억하면, 고객 상담이 훨씬 쉬워집니다.",
        ],
    })
    if idx < total - 1:
        last = ["보장 범위와 지급 조건은 상품마다 다르니, 안내 전에 꼭 약관을 확인해 주세요.",
                "다음 영상에서 만나요. 감사합니다."]
    else:
        last = ["보장 범위와 지급 조건은 상품마다 다르니, 안내 전에 꼭 약관을 확인해 주세요.",
                "이것으로 특약 교육 과정을 모두 마쳤습니다. 수고 많으셨어요."]
    scenes.append({"type": "outro", "say": last})
    return scenes


def probe_duration(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", path])
    return float(out.strip())


async def tts(text, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
            return
        except Exception:  # 네트워크 일시 오류 시 재시도
            if attempt == 3:
                raise
            await asyncio.sleep(2 ** attempt)


async def build_video(cat, idx, total, out_root):
    out = os.path.join(out_root, cat["id"])
    clips = os.path.join(out, "clips")
    os.makedirs(clips, exist_ok=True)
    scenes = build_scenes(cat, idx, total)

    jobs = []
    for si, sc in enumerate(scenes):
        for k, text in enumerate(sc["say"]):
            jobs.append(tts(text, os.path.join(clips, f"s{si:02d}_{k}.mp3")))
    # 동시에 너무 많이 요청하지 않도록 나눠서 합성
    for i in range(0, len(jobs), 6):
        await asyncio.gather(*jobs[i:i + 6])

    # 타임라인 계산 + 내레이션 트랙 조립 (ffmpeg concat 용 무음/음성 목록)
    t = 0.0
    concat = []
    silence_cache = {}

    def silence(sec):
        key = round(sec, 3)
        if key not in silence_cache:
            p = os.path.join(clips, f"sil_{int(key * 1000)}.wav")
            if not os.path.exists(p):
                subprocess.check_call([
                    "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                    f"anullsrc=r={SR}:cl=mono", "-t", f"{key}", p])
            silence_cache[key] = p
        concat.append(silence_cache[key])

    for si, sc in enumerate(scenes):
        sc["start"] = round(t, 3)
        local = LEAD_IN
        silence(LEAD_IN)
        sents = []
        for k, text in enumerate(sc["say"]):
            if sc["type"] == "quiz" and k == len(sc["say"]) - 1:
                sc["thinkAt"] = round(local, 3)
                silence(QUIZ_THINK)
                local += QUIZ_THINK
            p = os.path.join(clips, f"s{si:02d}_{k}.mp3")
            wav = p[:-4] + ".wav"
            if not os.path.exists(wav):
                subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", p,
                                       "-ar", str(SR), "-ac", "1", wav])
            d = probe_duration(wav)
            sents.append({"text": caption(text), "at": round(local, 3), "dur": round(d, 3)})
            concat.append(wav)
            local += d
            if k < len(sc["say"]) - 1:
                silence(GAP)
                local += GAP
        silence(TAIL)
        local += TAIL
        sc["sentences"] = sents
        sc["dur"] = round(local, 3)
        t += local

    lst = os.path.join(out, "concat.txt")
    with open(lst, "w") as f:
        for p in concat:
            f.write(f"file '{os.path.abspath(p)}'\n")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
                           "-i", lst, "-ar", str(SR), "-ac", "1",
                           os.path.join(out, "narration.wav")])

    timeline = {
        "id": cat["id"], "no": cat["no"], "title": cat["title"], "icon": cat["icon"],
        "color": cat["color"], "summary": cat["summary"], "total": total,
        "riderNames": [r["name"] for r in cat["riders"]],
        "duration": round(t, 3), "scenes": scenes,
    }
    with open(os.path.join(out, "timeline.json"), "w") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=1)
    print(f"{cat['id']}: {t:.1f}s, {len(scenes)} scenes")


async def main():
    out_root = sys.argv[1]
    only = set(sys.argv[2:])
    data = json.load(open(DATA, encoding="utf-8"))
    cats = data["categories"]
    for i, c in enumerate(cats):
        if only and c["id"] not in only:
            continue
        await build_video(c, i, len(cats), out_root)


if __name__ == "__main__":
    asyncio.run(main())
