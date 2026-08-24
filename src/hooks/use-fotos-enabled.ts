import { useEffect, useState } from "react";
import { loadFotosEnabled } from "@/lib/form-config";

/** Estado global (app_settings) do toggle de fotos. Default: ligado. */
export function useFotosEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    const onChange = (event: Event) => {
      if (alive && event instanceof CustomEvent && typeof event.detail === "boolean") setEnabled(event.detail);
    };
    window.addEventListener("pontoscan:fotos-enabled", onChange);
    loadFotosEnabled()
      .then((v) => { if (alive) setEnabled(v); })
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener("pontoscan:fotos-enabled", onChange);
    };
  }, []);
  return enabled;
}
