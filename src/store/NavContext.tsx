import { createContext, useContext } from "react";

export type NavTarget = { ronde?: string; locatie?: string; klantKey?: string; project?: string; factuur?: string; saneringId?: string; tauwId?: string } | null;

export const NavContext = createContext<{
  navigeer: (key: string, target?: NavTarget) => void;
}>({ navigeer: () => {} });

export const useNav = () => useContext(NavContext);
