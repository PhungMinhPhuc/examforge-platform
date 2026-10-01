import { useCallback, useEffect, useState, type RefObject } from "react";
import { readToolbarState } from "../formatting/state";
import type { ActiveTableSelection } from "../table/selection";
import { DEFAULT_TOOLBAR_STATE } from "../types";

export function useFormattingState(
  surfaceRef: RefObject<HTMLDivElement | null>,
  tableSelection: ActiveTableSelection | null,
) {
  const [state, setState] = useState(DEFAULT_TOOLBAR_STATE);
  const refresh = useCallback(() => {
    const surface = surfaceRef.current;
    if (surface) setState(readToolbarState(surface, tableSelection));
  }, [surfaceRef, tableSelection]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;
    const deferredRefresh = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        refresh();
      });
    };
    document.addEventListener("selectionchange", deferredRefresh);
    surface.addEventListener("keyup", refresh);
    surface.addEventListener("pointerup", refresh);
    surface.addEventListener("input", refresh);
    surface.addEventListener("focus", refresh);
    refresh();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", deferredRefresh);
      surface.removeEventListener("keyup", refresh);
      surface.removeEventListener("pointerup", refresh);
      surface.removeEventListener("input", refresh);
      surface.removeEventListener("focus", refresh);
    };
  }, [refresh, surfaceRef]);

  return { formattingState: state, refreshFormattingState: refresh };
}
