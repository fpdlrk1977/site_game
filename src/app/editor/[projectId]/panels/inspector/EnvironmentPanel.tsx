"use client";

// Environment 패널 — **씬 전역 설정.**
//
// ★ 2026-07-31 전면 축소: 1,461줄 → 이 크기.
//   하늘·안개·조명·태양·바닥·경계·플레이어·후처리·프레임·무드·팝업 기본값·메모를 전부 삭제했다.
//   **컨트롤이 있으나 아무것도 안 하는 상태**였다 — 룩 정리(BrickEnvironment)로 렌더 경로가 이미 사라졌기 때문.
//
// 남은 건 실제로 동작하는 둘뿐이다: **시작 뷰**(뷰어가 여는 카메라) · **노출**(톤매핑 밝기).

import { Camera, SunMedium } from "lucide-react";
import { useSceneStore } from "@/store/sceneStore";
import { useToast } from "@/hooks/useToast";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { SectionHeader, GroupBox } from "./ui";

export function EnvironmentPanel() {
  const environment = useSceneStore((s) => s.environment);
  const updateEnvironment = useSceneStore((s) => s.updateEnvironment);
  const requestSaveStartView = useSceneStore((s) => s.requestSaveStartView);
  const pushHistory = useSceneStore((s) => s.pushHistory);
  const { addToast } = useToast();

  return (
    <>
      {/* 시작 뷰 — 게시(둘러보기) 진입 시 카메라 위치·시선 */}
      <GroupBox>
        <SectionHeader
          title="Start View"
          icon={<Camera size={14} />}
          hint="게시된 뷰어에 방문자가 처음 들어왔을 때 보이는 카메라 위치·방향. 지정하지 않으면 기본 시점에서 시작합니다. 에디터에서 원하는 각도로 카메라를 맞춘 뒤 '현재 시점으로 저장'을 누르세요."
        />
        <div className="px-3 pb-4 space-y-2">
          <p className="text-[10px] text-muted/70 dark:text-muted">
            {environment.startView
              ? "시작 뷰가 저장돼 있어요. 방문자는 이 위치·방향에서 시작합니다."
              : "저장된 시작 뷰가 없어요. 방문자는 기본 시점에서 시작합니다."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                requestSaveStartView();
                addToast("현재 시점을 시작 뷰로 저장했어요");
              }}
              className="flex-1 px-2 py-1.5 rounded-xs bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors"
            >
              현재 시점으로 저장
            </button>
            {environment.startView && (
              <button
                onClick={() => {
                  updateEnvironment({ startView: undefined });
                  pushHistory();
                  addToast("시작 뷰를 지웠어요");
                }}
                className="px-2 py-1.5 rounded-xs border border-border text-[11px] text-foreground hover:bg-background transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        </div>
      </GroupBox>

      {/* 노출 — 유일하게 남은 룩 조절값(배경·안개·환경광은 BrickEnvironment가 고정으로 들고 있다) */}
      <GroupBox>
        <SectionHeader
          title="Exposure"
          icon={<SunMedium size={14} />}
          hint="씬 전체 밝기(톤매핑 노출). 에디터와 게시 뷰어에 똑같이 적용됩니다."
        />
        <div className="px-3 pb-4">
          <RangeSlider
            label="밝기"
            value={environment.toneMappingExposure ?? 1}
            min={0.2}
            max={2}
            step={0.05}
            onChange={(v) => updateEnvironment({ toneMappingExposure: v })}
            onCommit={pushHistory}
          />
        </div>
      </GroupBox>
    </>
  );
}
