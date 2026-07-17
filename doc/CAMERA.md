# CAMERA 시스템 구현 명세

> **카메라를 "오브젝트처럼 선택·배치·회전·애니"** 하고, 제작자가 **게시 시점·시야·시네마틱**을 제어할 수 있게 한다.
> 현재 카메라는 "렌더 시점"으로만 존재하고 **제작자가 만질 수 있는 게 거의 없다**(게시 도구의 큰 빈칸).
> 이 시스템은 **`doc/PIVOT_MANIPULATION.md`(조작·피벗 근간)** 와 **`doc/ANIMATION.md`(키프레임)** 위에 얹혀 대부분 재사용된다.
>
> 상태: **설계 문서** — 아래 단계(C1~C4)로 착수.

---

## 0. 현황 / 문제

**지금 있는 것**
- 렌더 시점 카메라: 에디터=OrbitControls(Ctrl+드래그 회전·휠 줌), 뷰어=둘러보기(궤도)/플레이(캐릭터 팔로우).
- `EnvSchema.frameAspect`(게시 화면 비율 레터박스), `toneMappingExposure`, 포스트 `effects.dof`(피사계심도), `fog`.
- `defaultMode`(explore/play)·`disableWalk`, 이벤트 `focus_object`/`reset_camera`, (임시) 카메라 북마크, 로드 시 자동 전체맞춤(InitialFit), 플레이 팔로우 카메라(`PlayModeController`).

**빈칸(제작자가 못 하는 것)**
- **게시 시작 시점** 저장 — 방문자가 "어디서 시작해 뭘 보는지" 지정 불가(항상 자동fit).
- **시야각(FOV)·투영(원근/직교)·근·원거리** 등 카메라 설정.
- **카메라 오브젝트** — 트리에 배치·조준·다중 뷰 전환.
- **카메라 애니(플라이스루/시네마틱)**.
- 플레이 **팔로우 카메라 세부**(거리·높이·1인칭/3인칭).

---

## 1. 목표 / 철학

- **카메라 = 오브젝트**: 위치·회전을 가진 씬 노드. **선택·조작 핸들·기즈모·애니**를 일반 오브젝트와 동일하게. (스케일은 카메라에 무의미 → 비활성)
- **제작자 시점 제어**: 시작 뷰·다중 뷰·시야각·시네마틱을 **노코드**로.
- **근간 재사용**: 조작(`PIVOT_MANIPULATION`)·애니(`ANIMATION`)·이벤트를 그대로 → 최소 신규 코드.
- **하위호환**: 카메라 미설정 = 현재 동작(자동fit/기존 팔로우) 그대로.

---

## 2. 카메라 = 오브젝트 (선택·조작)

- 신규 오브젝트 타입 **`camera`**(트리 아이콘: `Video`/`Camera`). `ObjectNodeSchema.camera?` 필드로 식별(assetId/primitive 없음).
- **선택·이동·회전**: 일반 오브젝트처럼 뷰포트 클릭 선택 + **조작 핸들/기즈모**(위치·회전만, 스케일 잠금).
- **조준(Look-at)**: 두 방식
  - 자유 회전(오브젝트 rotation) — 기본.
  - **타깃 지정**(`camera.targetId`) — 특정 오브젝트를 계속 바라봄(포탑·상품 회전대). *(PIVOT의 "제약(Constraints)" 아이디어와 연결.)*
- **에디터 시각화**: 카메라 **프러스텀(시야 사각뿔) 와이어** 표시(무엇을 보는지) + 작은 카메라 아이콘 메쉬. 뷰어엔 미표시.
- **"이 카메라로 보기" 프리뷰**: 선택 시 버튼 → 에디터 시점을 그 카메라로 잠깐 전환(what-you-see).
- 카메라도 **애니 클립 트랙 대상** → 키프레임 플라이스루(§6).

---

## 3. 카메라 설정 항목 (전부 — 무엇을 설정할 수 있나)

> 씬 전역 "메인 카메라 설정" + 카메라 오브젝트별 설정 공용. 대부분 옵셔널·기본값 = 현재 동작.

### 3.1 렌즈/투영
| 항목 | 설명 | 기본 |
|---|---|---|
| **projection** | `perspective`(원근) / `orthographic`(직교=아이소메트릭·2.5D·상품샷) | perspective |
| **fov** | 시야각(°). 작을수록 망원(압축)·클수록 광각(왜곡) | 50 |
| **focalLength(mm)** | FOV 대체 표기(35mm 환산 — 사진작가 친화, 24=광각·50=표준·85=인물). fov와 상호변환 | — |
| **orthoZoom** | 직교일 때 배율 | 1 |
| **near / far** | 근·원거리 클립(너무 가깝/먼 것 컷). 원경 잘림·z-fighting 조절 | 0.1 / 1000 |
| **aspect / frameAspect** | 화면 비율(기존 `frameAspect` 승계 — 16:9·1:1·9:16 세로 등, 모바일 임베드) | 자유 |

### 3.2 시점(트랜스폼)
| 항목 | 설명 |
|---|---|
| **position / rotation** | 카메라 위치·방향(오브젝트 트랜스폼) |
| **target(look-at)** | 바라보는 지점/오브젝트(옵션) |
| **roll(tilt)** | 좌우 기울기(더치 앵글) |
| **up** | 상방 벡터(특수 연출) |

### 3.3 감성/후처리 (일부 기존 재사용)
| 항목 | 설명 | 기존 |
|---|---|---|
| **exposure** | 노출(밝기) | `toneMappingExposure` 있음 |
| **depthOfField** | 피사계심도 — 초점거리·조리개(보케). 초점 풀(focus pull) 애니 가능 | `effects.dof` 있음 |
| **vignette / bloom / 색보정** | 시네마틱 룩 | `effects.*` 있음 |
| **motionBlur** | 이동 블러(고급) | 신규 |
| **filmBars(레터박스)** | 시네마틱 검은 띠(컷신) | 신규 |
| **cameraShake** | 흔들림(충격/앰비언트, 게임감) | 신규 |

### 3.4 뷰어/플레이 동작
| 항목 | 설명 |
|---|---|
| **defaultMode** | 둘러보기/플레이 진입(기존) |
| **explore 제한** | 궤도 회전·줌·패닝 허용 범위(각도/거리 min·max), 자동회전(턴테이블) |
| **follow(플레이)** | 3인칭 거리·높이·각도 / **1인칭** 토글 / 충돌 회피(벽 뚫음 방지) |
| **transition** | 뷰 전환 방식(즉시 컷 / 부드럽게, 이징·시간) |

---

## 4. 데이터 스키마 (초안)

```ts
// 카메라 오브젝트 (ObjectNodeSchema.camera 있으면 카메라 노드)
interface CameraConfig {
  projection?: 'perspective' | 'orthographic';
  fov?: number;            // perspective (focalLength와 상호변환)
  orthoZoom?: number;      // orthographic
  near?: number; far?: number;
  targetId?: string | null;   // look-at 대상(없으면 rotation 사용)
  roll?: number;              // deg
  dof?: { focusDistance?: number; aperture?: number };
  exposure?: number;
  // 뷰 메타
  name?: string;              // 뷰 이름(다중 뷰 전환용)
}

interface ObjectNodeSchema {
  // ...
  camera?: CameraConfig;
}

// 씬 전역 — 게시 시작/기본 카메라
interface EnvSchema {
  // ...
  startView?: {               // C1: 게시 시작 시점(자동fit 대신)
    position: Vector3; target: Vector3; fov?: number; projection?: 'perspective'|'orthographic';
  };
  activeCameraId?: string | null;   // 시작 시 활성 카메라(있으면 startView보다 우선)
  cameraTransition?: { mode: 'cut'|'smooth'; sec?: number; easing?: string }; // 뷰 전환 기본
  explore?: { autoRotate?: boolean; minDistance?: number; maxDistance?: number; minPolar?: number; maxPolar?: number };
  follow?: { distance?: number; height?: number; firstPerson?: boolean; collide?: boolean };
}
```

- 전부 옵셔널·미설정=현재 동작 → **기존 씬 무변경**. `normalize`/`save`가 objects·environment 통과라 자동 보존.

---

## 5. 이벤트 / 다중 뷰 전환

- 카메라 북마크(현재 임시)를 **씬 저장 뷰**로 승격 + 카메라 오브젝트를 뷰로 사용.
- **이벤트 액션 신규**:
  - `go_to_view`(value=viewId/cameraId) — 그 뷰로 전환(§4 transition 적용). `focus_object`의 "이름 있는 뷰" 버전.
  - `set_active_camera` — 활성 카메라 교체.
- 활용: "건물 클릭 → 실내 카메라로", "다음 버튼 → 다음 전시 뷰", 게임 컷신 트리거.

---

## 6. 카메라 애니메이션 (시네마틱)

- 카메라 오브젝트를 **애니 클립 트랙**에 추가 → 위치·회전·(fov/focus) 키프레임 = **플라이스루**. (`ANIMATION.md` 시스템 100% 재사용)
- **트리거**: `scene_start`(인트로 자동), 이벤트(버튼), 변수.
- **고급(후속)**: **스플라인 경로 카메라**(패스 따라 이동), **초점 풀**(DOF focusDistance 애니), **타깃 추종 + 궤도**.
- 플레이 모드 컷신: 조작 잠금(기존 `interactionLock` 패턴) + 시네마틱 바.

---

## 7. 내 추가 아이디어 (전문가 제안)

- **초점거리(mm) 표기 병행** — FOV 숫자보다 "50mm" 가 감이 옴(사진/영상 사용자). 슬라이더는 mm, 내부 FOV 변환.
- **오브젝트로 프레이밍한 뷰 저장** — "이 오브젝트가 화면에 꽉 차게" 자동 계산해 뷰로 저장(제품 쇼케이스).
- **직교(iso) 프리셋** — 아이소메트릭 게임·건축·상품 3면도. `projection:orthographic` + 45°/35.264° 각.
- **세로(portrait) 반응형** — `frameAspect 9:16`과 묶어 모바일 임베드에서 세로 시네마틱.
- **턴테이블 오토회전** — 상품/캐릭터 자동 회전 뷰(제품 페이지 킬러 기능).
- **뷰 전환 이징** — 컷 vs 부드러운 이동(관광/쇼룸엔 부드럽게, 게임엔 컷).
- **카메라 셰이크 프리셋** — 충격(임팩트)·앰비언트(손떨림) 게임감.
- **컴포지션 가이드**(에디터 전용) — 3분할·세이프에어리어 오버레이로 구도 잡기.
- **DOF 초점 풀** — 대화·강조 시 초점 이동 시네마틱.
- **다중 시작점(딥링크)** — URL로 특정 뷰에서 시작(전시 A/B 링크).
- **VR/360 파노라마 뷰어** — (먼 후속) 스카이박스와 결합.

> 사용자가 모를 수 있는 것 챙김: **near/far**(원경 잘림·깜빡임 방지), **직교 투영**(iso 룩), **초점거리 개념**, **프러스텀 시각화**(무엇을 보는지), **뷰 전환 이징**, **팔로우 충돌 회피**(벽 뚫는 카메라 방지).

---

## 8. 단계별 구현 계획 (가치 순)

| 단계 | 내용 | 근간 재사용 | 가치/난이도 |
|---|---|---|---|
| **C1** | **게시 시작 뷰 저장** — 현재 에디터 시점을 `startView`로 저장 → 뷰어가 거기서 시작(+FOV) | 시점 캡처만 | ★최대 / 쉬움 |
| **C2** | **카메라 설정** — FOV/초점거리·투영(원근/직교)·near/far·노출·explore 제한·follow 세부 | 기존 후처리/모드 확장 | 큼 / 쉬움~중 |
| **C3** | **카메라 오브젝트** — 트리 배치·조준(핸들 재사용)·프러스텀·프리뷰 + **이벤트 뷰 전환**(다중 뷰·transition) | PIVOT 조작 근간 | 큼 / 중 |
| **C4** | **카메라 애니** — 키프레임 플라이스루·컷신(경로·초점 풀은 후속) | ANIMATION 클립 | 큼 / 중상 |

- **C1은 근간 없이도 지금 바로** 가능(작은 작업, 게시 UX 즉효).
- **C3/C4는 PIVOT 조작 근간 완성 후** 얹으면 저비용(핸들·애니 공짜 상속).
- 각 단계: tsc 클린 + 브라우저 확인. 하위호환(미설정=현행) 유지.

---

## 9. 위험 / 결정 필요

- **결정 A**: 시작 뷰를 **`startView`(좌표 저장)** 로 갈지, 처음부터 **카메라 오브젝트 활성(activeCameraId)** 으로 갈지. → 권장: C1은 `startView`(간단), C3에서 오브젝트 도입(둘 공존, 오브젝트 우선).
- **결정 B**: 카메라 오브젝트가 **플레이 모드**에서도 유효할지(플레이는 캐릭터 팔로우가 기본) — 컷신/고정샷 때만 오버라이드.
- **제약**: 직교↔원근 전환 시 구도 점프(전환 이징으로 완화) · DOF/모션블러는 성능 비용(옵트인) · 팔로우 충돌 회피는 레이캐스트 추가.
- **하위호환**: 전부 옵셔널. 카메라 미사용 씬 = 자동fit/기존 팔로우 그대로.

---

## 10. 재사용 파일 참조

- `doc/PIVOT_MANIPULATION.md` — 카메라 오브젝트 선택·핸들·기즈모(위치·회전)·타깃 제약.
- `doc/ANIMATION.md` — 카메라 플라이스루(클립 트랙).
- `EnvSchema.frameAspect`·`toneMappingExposure`·`effects`(dof/bloom/vignette)·`fog` — 카메라 설정에 흡수.
- `EnvSchema.defaultMode`·`disableWalk`·`PlayModeController` — explore/follow 동작 확장.
- 이벤트 `focus_object`/`reset_camera` — `go_to_view`/`set_active_camera`로 확장.
- 에디터 InitialFit·카메라 북마크 — startView/저장 뷰로 승격.
