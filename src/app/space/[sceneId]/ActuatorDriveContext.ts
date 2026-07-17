import { createContext } from 'react';

// 액추에이터 구동값(목표) — objectId → 목표 driveValue(0..1). doc/PIVOT_MANIPULATION.md §6.
//   variable 구동 = 바인딩 변수값(clamp01) · event 구동 = set_actuator가 지정한 목표.
//   ViewerObject가 자기 id의 목표를 읽어 MotionGroup에서 부드럽게 이징. (여러 경로 렌더라 prop 대신 컨텍스트)
export const ActuatorDriveContext = createContext<Record<string, number>>({});
