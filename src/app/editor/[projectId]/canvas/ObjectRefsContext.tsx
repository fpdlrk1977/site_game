'use client';

import { createContext, useContext, useRef, type MutableRefObject } from 'react';
import type * as THREE from 'three';

type RefsMap = Map<string, THREE.Object3D>;

export const ObjectRefsContext = createContext<MutableRefObject<RefsMap> | null>(null);

export function useObjectRefs(): MutableRefObject<RefsMap> {
  const ctx = useContext(ObjectRefsContext);
  if (!ctx) throw new Error('useObjectRefs must be inside ObjectRefsContext.Provider');
  return ctx;
}
