'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import type { GradientFill } from '@/types/scene';

type MappingMode = 'face' | 'wrap' | 'pattern';

// 정지점 램프 → 1D CanvasTexture. 셰이더에서 t(0..1)로 샘플. 색은 sRGB 바이트로 저장(셰이더에서 pow(2.2) 디코드).
function buildGradientTexture(stops: { color: string; pos: number }[]): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || stops.length < 2) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  [...stops].sort((a, b) => a.pos - b.pos).forEach((s) => g.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

interface Props {
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  emissiveIntensity: number;
  wireframe?: boolean;
  textureUrl?: string;
  repeat?: { x: number; y: number };
  flatShading?: boolean;
  side?: THREE.Side;
  clearcoat?: number;
  sheen?: number;
  transmission?: number;
  ior?: number;
  vertexColors?: boolean; // 복셀 등 정점색 지오메트리 — 색을 정점에서 읽음(베이스 흰색)
  // 텍스처 투영: 'face'=면마다 한 장(기본) · 'wrap'=한 장을 전체에 보자기처럼 · 'pattern'=무늬 반복(triplanar)
  textureMapping?: MappingMode;
  triplanarScale?: number;          // pattern 모드 반복 스케일(로컬 유닛당)
  wrapMin?: [number, number, number];  // wrap/gradient 모드용 지오메트리 로컬 bbox 최소점
  wrapSize?: [number, number, number]; // wrap/gradient 모드용 지오메트리 로컬 bbox 크기
  gradient?: GradientFill | null;   // 있으면 표면을 정지점 램프로 렌더(color 대신). bbox 로컬좌표로 투영.
}

// 프리미티브 표준 재질 — 색상 + 선택적 이미지 텍스처(map). 에디터/뷰어가 공유.
// 텍스처 로딩을 비동기(비-Suspense)로 처리해 인라인 mesh에 Suspense 경계 없이도 안전하게 쓸 수 있다.
export function PrimitiveMaterial({
  color, roughness, metalness, emissive, emissiveIntensity, wireframe, textureUrl, repeat, flatShading, side,
  clearcoat, sheen, transmission, ior, vertexColors, textureMapping, triplanarScale, wrapMin, wrapSize, gradient,
}: Props) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const rx = repeat?.x ?? 1;
  const ry = repeat?.y ?? 1;

  // ── 그라데이션 fill ── 정지점 램프를 1D 텍스처로 굽고, 셰이더에서 bbox 로컬좌표 t로 샘플.
  const gradStops = gradient?.stops ?? [];
  const gradActive = !!gradient && gradStops.length >= 2;
  const gradSig = gradActive ? `${gradient!.type}|${gradient!.angle ?? 0}|${gradStops.map((s) => `${s.color}@${s.pos}`).join(',')}` : '';
  const gradTex = useMemo(() => (gradActive ? buildGradientTexture(gradStops) : null), [gradSig, gradActive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { gradTex?.dispose(); }, [gradTex]); // 교체/언마운트 시 이전 텍스처 정리
  const gradMode = gradActive && gradTex ? (gradient!.type === 'radial' ? 2 : 1) : 0;
  const gradAngle = ((gradient?.angle ?? 0) * Math.PI) / 180;
  const gradScale = gradient?.scale ?? 1;
  const gradOffset = gradient?.offset ?? 0;
  const radModeNum = ({ facing: 0, surface: 1, axis: 2 } as const)[gradient?.radialMode ?? 'facing']; // radial 투영 방식

  useEffect(() => {
    if (!textureUrl) { setTex(null); return; }
    let cancelled = false;
    new THREE.TextureLoader().load(textureUrl, (t) => {
      if (cancelled) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      setTex(t);
    });
    return () => { cancelled = true; };
  }, [textureUrl]);

  useEffect(() => {
    if (tex) { tex.repeat.set(rx, ry); tex.needsUpdate = true; }
  }, [tex, rx, ry]);

  // ── Triplanar 투영(wrap/pattern) ── 면별 UV 대신 오브젝트 로컬 좌표를 3축으로 투영.
  //   wrap  = bbox 기준 0~1로 정규화 → 한 장을 전체에 딱 한 번(보자기).
  //   pattern = 로컬좌표×scale 반복 → 무늬가 표면 전체에 이음새 없이 타일.
  //   값(mode/scale/bbox)은 uniform으로 갱신(재컴파일 없음). 켜고 끌 때만 key로 재마운트.
  const triplanar = (textureMapping === 'wrap' || textureMapping === 'pattern') && !!tex;
  // 재질 인스턴스별 고유 프로그램 캐시 키 — 여러 오브젝트가 프로그램을 공유하면 onBeforeCompile이
  //   재호출되지 않아 uniform이 일부 재질에 안 걸리는 함정을 회피(인스턴스마다 컴파일 1회).
  const uidRef = useRef(Math.random().toString(36).slice(2));
  const stateRef = useRef({
    mode: 0, scale: 1, min: [-0.5, -0.5, -0.5] as number[], size: [1, 1, 1] as number[],
    gradMode: 0, gradAngle: 0, gradScale: 1, gradOffset: 0, radMode: 0, gradTex: null as THREE.Texture | null,
  });
  stateRef.current.mode = textureMapping === 'pattern' ? 1 : 0;
  stateRef.current.scale = triplanarScale ?? 1;
  stateRef.current.min = wrapMin ?? [-0.5, -0.5, -0.5];
  stateRef.current.size = wrapSize ?? [1, 1, 1];
  stateRef.current.gradMode = gradMode;
  stateRef.current.gradAngle = gradAngle;
  stateRef.current.gradScale = gradScale;
  stateRef.current.gradOffset = gradOffset;
  stateRef.current.radMode = radModeNum;
  stateRef.current.gradTex = gradTex;
  const shaderRef = useRef<{ uniforms: Record<string, { value: unknown }> } | null>(null);
  useEffect(() => {
    const s = shaderRef.current;
    if (!s) return;
    s.uniforms.uWrapMode.value = stateRef.current.mode;
    s.uniforms.uTriScale.value = stateRef.current.scale;
    (s.uniforms.uWrapMin.value as THREE.Vector3).fromArray(stateRef.current.min);
    (s.uniforms.uWrapSize.value as THREE.Vector3).fromArray(stateRef.current.size);
    if (s.uniforms.uGradMode) {
      s.uniforms.uGradMode.value = stateRef.current.gradMode;
      s.uniforms.uGradAngle.value = stateRef.current.gradAngle;
      s.uniforms.uGradScale.value = stateRef.current.gradScale;
      s.uniforms.uGradOffset.value = stateRef.current.gradOffset;
      s.uniforms.uRadMode.value = stateRef.current.radMode;
      s.uniforms.uGradTex.value = stateRef.current.gradTex;
    }
  }, [textureMapping, triplanarScale, wrapMin, wrapSize, gradSig, gradMode, gradAngle, gradScale, gradOffset, radModeNum, gradTex]);

  const onBeforeCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uWrapMode = { value: stateRef.current.mode };
    shader.uniforms.uTriScale = { value: stateRef.current.scale };
    shader.uniforms.uWrapMin = { value: new THREE.Vector3().fromArray(stateRef.current.min) };
    shader.uniforms.uWrapSize = { value: new THREE.Vector3().fromArray(stateRef.current.size) };
    shader.uniforms.uGradMode = { value: stateRef.current.gradMode };
    shader.uniforms.uGradAngle = { value: stateRef.current.gradAngle };
    shader.uniforms.uGradScale = { value: stateRef.current.gradScale };
    shader.uniforms.uGradOffset = { value: stateRef.current.gradOffset };
    shader.uniforms.uRadMode = { value: stateRef.current.radMode };
    shader.uniforms.uGradTex = { value: stateRef.current.gradTex };
    shaderRef.current = shader as unknown as { uniforms: Record<string, { value: unknown }> };
    // 정점: 로컬 좌표/법선 + radial 'facing'(뷰 기준)용 뷰공간 위치/중심/반경을 varying으로 전달.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nvarying vec2 vGViewPos;\nvarying vec2 vGViewCtr;\nvarying float vGRadius;\nuniform vec3 uWrapMin;\nuniform vec3 uWrapSize;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vTriPos = position;
  vTriNormal = normal;
  {
    vec3 _ctr = uWrapMin + uWrapSize * 0.5;
    vGViewPos = (modelViewMatrix * vec4(position, 1.0)).xy;
    vGViewCtr = (modelViewMatrix * vec4(_ctr, 1.0)).xy;
    vec3 _ex = (modelViewMatrix * vec4(uWrapSize.x, 0.0, 0.0, 0.0)).xyz;
    vec3 _ey = (modelViewMatrix * vec4(0.0, uWrapSize.y, 0.0, 0.0)).xyz;
    vGRadius = 0.25 * (length(_ex) + length(_ey)); // 뷰공간 XY 반경(줌 무관·원형 유지)
  }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nvarying vec2 vGViewPos;\nvarying vec2 vGViewCtr;\nvarying float vGRadius;\nuniform float uWrapMode;\nuniform float uTriScale;\nuniform vec3 uWrapMin;\nuniform vec3 uWrapSize;\nuniform float uGradMode;\nuniform float uGradAngle;\nuniform float uGradScale;\nuniform float uGradOffset;\nuniform float uRadMode;\nuniform sampler2D uGradTex;')
      // 그라데이션 — 베이스 색을 정지점 램프로 대체(map/vertexColor보다 먼저).
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        if (uGradMode > 0.5) {
          vec3 _gp = (vTriPos - uWrapMin) / max(uWrapSize, vec3(1e-4));
          vec2 _adir = vec2(cos(uGradAngle), sin(uGradAngle));
          float _gt;
          if (uGradMode < 1.5) {
            // linear — 로컬 XY 방향 투영
            _gt = dot(_gp.xy - 0.5, _adir) + 0.5;
          } else if (uRadMode < 0.5) {
            // radial · facing — 카메라 바라보는 쪽 기준 원형(뷰공간, 줌 무관). offset=중심 이동.
            vec2 _c = vGViewCtr + uGradOffset * vGRadius * _adir;
            _gt = length(vGViewPos - _c) / max(vGRadius, 1e-4) / max(uGradScale, 0.05);
          } else if (uRadMode < 1.5) {
            // radial · surface — 면 법선 기준, 지배 축 제외한 2D에서 면 중앙 원형(패널·벽)
            vec3 _an = abs(normalize(vTriNormal));
            vec2 _uv = (_an.x >= _an.y && _an.x >= _an.z) ? _gp.yz : (_an.y >= _an.z ? _gp.xz : _gp.xy);
            vec2 _c = vec2(0.5) + uGradOffset * 0.5 * _adir;
            _gt = length(_uv - _c) * 2.0 / max(uGradScale, 0.05);
          } else {
            // radial · axis — 로컬 XY 고정(오브젝트에 붙음)
            vec2 _c = vec2(0.5) + uGradOffset * 0.5 * _adir;
            _gt = length(_gp.xy - _c) * 2.0 / max(uGradScale, 0.05);
          }
          _gt = clamp(_gt, 0.0, 1.0);
          vec3 _gcol = texture2D(uGradTex, vec2(_gt, 0.5)).rgb;
          diffuseColor.rgb = pow(_gcol, vec3(2.2));
        }
      `)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec3 _n = normalize(vTriNormal);
          if (uWrapMode < 0.5) {
            // Wrap(보자기) — 구(Sphere)에 텍스처 넣은 것처럼 한 장을 구면 투영으로 사방에 덮음.
            //   중심에서 각 지점 방향(경도=U, 위도=V)으로 매핑 → 앞=얼굴 중앙, 양옆=얼굴 양옆이 당겨지고,
            //   위/아래는 극점으로 모여 '하나의 얼굴이 전체를 감싼' 모양. 도형 종류 무관(박스·구·실린더…).
            vec3 _ctr = uWrapMin + uWrapSize * 0.5;
            vec3 _d = normalize(vTriPos - _ctr);
            float _u = atan(_d.x, _d.z) / 6.2831853 + 0.5;              // 경도 0..1
            float _v = 0.5 - asin(clamp(_d.y, -1.0, 1.0)) / 3.14159265; // 위도 0(위)..1(아래)
            diffuseColor *= texture2D(map, vec2(_u, _v));
          } else {
            // Pattern — triplanar 타일 반복.
            vec3 _w = abs(_n); _w = pow(_w, vec3(4.0)); _w /= (_w.x + _w.y + _w.z + 1e-5);
            vec4 _cx = texture2D(map, vTriPos.zy * uTriScale);
            vec4 _cy = texture2D(map, vTriPos.xz * uTriScale);
            vec4 _cz = texture2D(map, vTriPos.xy * uTriScale);
            diffuseColor *= _cx * _w.x + _cy * _w.y + _cz * _w.z;
          }
        #endif
      `);
  }, []);
  // 커스텀 셰이더 = triplanar 텍스처 투영 또는 그라데이션. 둘 중 하나라도 켜지면 onBeforeCompile 적용.
  const customShader = triplanar || gradActive;
  const triProps = customShader ? { onBeforeCompile, customProgramCacheKey: () => `prim-cust-${uidRef.current}` } : {};
  const triKey = `${triplanar ? 'tri' : 'face'}-${gradActive ? 'grad' : 'nograd'}`;

  // 텍스처/정점색이 있으면 베이스 색을 흰색으로 → 이미지·정점색이 재질 색에 물들지 않고 그대로 보임.
  const base = (tex || vertexColors) ? '#ffffff' : color;
  const t = transmission ?? 0;
  const hasPhysical = t > 0 || (clearcoat ?? 0) > 0 || (sheen ?? 0) > 0;

  // 물리 재질(clearcoat/sheen/transmission) — 가벼운 내장 MeshPhysicalMaterial.
  //   유리(transmission): 비금속이어야 뒤가 비치므로 metalness 0 강제. transparent는 불필요(three가
  //   transmission을 transmissive 렌더 리스트로 분류해 뒤 씬 버퍼를 자동 샘플). thickness>0 + ior 필요.
  if (hasPhysical) {
    return (
      // key에 재질 종류·flatShading·triplanar 포함 → 전환 시 재마운트(셰이더 재컴파일 안전).
      <meshPhysicalMaterial
        key={`phys-${tex ? 'tex' : 'plain'}-${flatShading ? 'flat' : 'smooth'}-${vertexColors ? 'vc' : ''}-${triKey}`}
        map={tex ?? undefined}
        color={base}
        vertexColors={vertexColors ?? false}
        roughness={roughness}
        metalness={t > 0 ? 0 : metalness}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        wireframe={wireframe}
        flatShading={flatShading ?? false}
        side={side ?? THREE.FrontSide}
        clearcoat={clearcoat ?? 0}
        clearcoatRoughness={0.1}
        sheen={sheen ?? 0}
        sheenColor={base}
        transmission={t}
        thickness={t > 0 ? 1 : 0}
        ior={ior ?? 1.5}
        {...triProps}
      />
    );
  }

  return (
    // key: 텍스처 유무·flatShading·triplanar 전환 시 재질을 새로 마운트해 셰이더 재컴파일 이슈 회피.
    <meshStandardMaterial
      key={`std-${tex ? 'tex' : 'plain'}-${flatShading ? 'flat' : 'smooth'}-${vertexColors ? 'vc' : ''}-${triKey}`}
      map={tex ?? undefined}
      color={base}
      vertexColors={vertexColors ?? false}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      wireframe={wireframe}
      flatShading={flatShading ?? false}
      side={side ?? THREE.FrontSide}
      {...triProps}
    />
  );
}
