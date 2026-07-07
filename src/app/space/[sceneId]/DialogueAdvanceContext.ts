import { createContext } from 'react';

// E키를 누를 때마다 1씩 증가하는 nonce. "현재 가장 가까운 대상"만 이 신호에 반응한다
// (ViewerObject가 자신이 근접 대상일 때만 대화를 열거나 다음 문장으로 넘긴다).
export const DialogueAdvanceContext = createContext<number>(0);
