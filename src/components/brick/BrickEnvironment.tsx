'use client';

// 브릭 씬의 배경·조명 — **에디터·뷰어가 같이 쓰는 하나의 룩.** `<Canvas>` 안에 넣는다.
//
// ★ 조명은 **평평한 환경광 하나뿐**이다 — 마인크래프트와 같은 모델.
//   입체감은 전부 **구운 값**이 만든다(하늘빛 전파 × 면 방향 고정 배율, `world.FACE_TONE`).
//   방향광을 쓰면 그 위에 **움직이는 음영**이 겹쳐서, 블록을 쌓으면 옆 블록에 그림자가 지고
//   카메라를 돌릴 때마다 어떤 면은 직사광선처럼 번쩍인다. 마크엔 태양 방향이 없다.
//   → **방향광·그림자 맵은 넣지 않는다.** (그림자 패스는 실측에서 프레임의 절반인 10.3ms였다)
//
// ★ 배경·안개 색이 룩을 좌우한다 — 실시간 그림자를 끈 뒤로는 특히.
//   어두운 배경에 안개를 멀리 두면 먼 지형이 검게 사그라들어 "카메라 주변만 밝은 스포트라이트"처럼
//   보인다. 낮 하늘 톤 + **지형 반경보다 먼저 잠기는** 안개가 자연스러운 원경을 만든다.

/** 하늘·안개 색 — 같은 값이어야 지평선이 하드컷 없이 잠긴다 */
export const BRICK_SKY = '#a6bccf';
/** 안개 시작·끝(m). 끝은 **지형 반경(약 48m)보다 앞**이어야 스트리밍 경계가 안 드러난다 */
export const BRICK_FOG: [number, number] = [18, 46];
/** 환경광 세기 — 유일한 광원 */
export const BRICK_AMBIENT = 1.6;

export function BrickEnvironment() {
  return (
    <>
      <color attach="background" args={[BRICK_SKY]} />
      <fog attach="fog" args={[BRICK_SKY, BRICK_FOG[0], BRICK_FOG[1]]} />
      <ambientLight intensity={BRICK_AMBIENT} />
    </>
  );
}
