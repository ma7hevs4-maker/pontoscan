import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (text: string) => void;
  onError?: (e: string) => void;
}

export function QrScanner({ onScan, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const id = "qr-reader-region";
    const el = ref.current;
    if (!el) return;
    el.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decoded) => {
        if (doneRef.current) return;
        doneRef.current = true;
        onScan(decoded);
      },
      () => {}
    ).catch((e) => onError?.(String(e)));

    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [onScan, onError]);

  return <div ref={ref} className="w-full overflow-hidden rounded-xl bg-black" />;
}