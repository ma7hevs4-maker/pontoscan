import { useEffect, useState } from "react";
import { loadFotosEnabled } from "@/lib/form-config";

/** Estado global (app_settings) do toggle de fotos. Default: ligado. */
export function useFotosEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let alive = true;
    loadFotosEnabled()
      .then((v) => { if (alive) setEnabled(v); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return enabled;
}
