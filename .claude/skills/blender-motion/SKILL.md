---
name: blender-motion
description: "Blender Python(bpy) 스크립트로 3D 장면과 카메라·오브젝트 애니메이션을 만든다. '블렌더로 3D 장면 만들어줘', '3D 애니메이션 스크립트' 요청에 사용."
---

# Blender-Motion — Python 기반 3D 장면

## 출력 형태
- 하나의 `scene.py` 파일. 실행: `blender --background --python scene.py`
- 스크립트 첫 부분에서 기본 장면을 비우고(`bpy.ops.wm.read_factory_settings(use_empty=True)`) 재현 가능하게 만든다.

## 스크립트 구조
1. **설정**: 해상도, fps(기본 30), 프레임 범위, 렌더 엔진(빠른 미리보기는 EEVEE, 최종은 Cycles)
2. **오브젝트**: 메쉬 생성 함수로 분리, 이름을 붙여 나중에 찾기 쉽게
3. **재질**: Principled BSDF 노드로 색/거칠기 지정
4. **조명/카메라**: 3점 조명, 카메라는 `track_to` 제약으로 대상 추적
5. **애니메이션**: `obj.keyframe_insert(data_path="location", frame=N)`, 보간은 F-Curve에서 `BEZIER` + ease 설정
6. **렌더**: `bpy.context.scene.render.filepath`, 미리보기용 저해상도 옵션 제공

## 규칙
- 매직 넘버는 상단 상수로 모은다 (FPS, DURATION, COLORS).
- Blender 버전 차이가 있는 API는 주석으로 버전을 명시한다.
- Blender가 설치돼 있으면 `--background`로 실제 실행해 오류가 없는지 확인한다.
