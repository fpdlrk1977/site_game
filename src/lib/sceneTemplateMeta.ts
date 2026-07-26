/**
 * 씬 템플릿의 "표시용" 메타데이터.
 *
 * 왜 `sceneTemplates.ts`와 분리하나:
 *   대시보드는 템플릿 이름·설명만 보여주면 되는데, sceneTemplates.ts를 임포트하면
 *   전 템플릿의 build() 함수(오브젝트 수십 개 정의)가 클라이언트 번들에 딸려 온다.
 *   실제 씬 생성은 서버 액션(createProject)이 하므로 브라우저엔 이 목록이면 충분하다.
 *
 * id/name이 SCENE_TEMPLATES와 어긋나면 sceneTemplates.test.ts가 잡는다.
 */
export interface SceneTemplateMeta {
  id: string;
  name: string;
  description: string;
  /** 카드 미리보기 그라데이션 (썸네일이 없으므로 분위기만 전달) */
  gradient: string;
  /** lucide 아이콘 키 — 실제 컴포넌트 매핑은 UI 쪽에서 */
  icon: 'blank' | 'showroom' | 'gallery' | 'plaza' | 'cafe';
}

export const SCENE_TEMPLATE_META: SceneTemplateMeta[] = [
  {
    id: 'empty',
    name: '빈 씬',
    description: '바닥만 있는 빈 공간',
    gradient: 'linear-gradient(135deg,#3a3550,#232030)',
    icon: 'blank',
  },
  {
    id: 'showroom',
    name: '쇼룸',
    description: '스포트라이트로 연출한 제품 전시 공간',
    gradient: 'linear-gradient(135deg,#2b2338,#5b3f7a)',
    icon: 'showroom',
  },
  {
    id: 'gallery',
    name: '갤러리',
    description: '천창과 픽처 라이트가 있는 화이트 큐브',
    gradient: 'linear-gradient(135deg,#d9d6e6,#8f8ba8)',
    icon: 'gallery',
  },
  {
    id: 'plaza',
    name: '광장',
    description: '긴 그림자와 안개가 있는 야외 공간',
    gradient: 'linear-gradient(135deg,#f0a35e,#6f4b8e)',
    icon: 'plaza',
  },
  {
    id: 'cafe',
    name: '카페',
    description: '창가 자연광과 펜던트 조명의 실내',
    gradient: 'linear-gradient(135deg,#a9713f,#4a2f24)',
    icon: 'cafe',
  },
];
