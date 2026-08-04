"use client";

import { useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

// Result emitted on save. SVG images only carry a new display scale (stored in
// the database); raster images carry the edited pixel data as a PNG blob.
export type ImageEditResult =
  | { kind: "raster"; blob: Blob }
  | { kind: "scale"; scale: number };

interface Props {
  src: string;
  initialScale?: number;
  onSave: (result: ImageEditResult) => Promise<void> | void;
  onClose: () => void;
}

function isSvgSrc(src: string): boolean {
  return /\.svg(\?|#|$)/i.test(src);
}

export default function ImageEditorModal({
  src,
  initialScale = 1,
  onSave,
  onClose,
}: Props) {
  const isSvg = isSvgSrc(src);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [saving, setSaving] = useState(false);
  const [sizePercent, setSizePercent] = useState(100);
  // SVG: edit the stored display scale instead of touching the file
  const [svgScale, setSvgScale] = useState(initialScale || 1);

  useEffect(() => {
    if (isSvg || !imgRef.current) return;
    const cropper = new Cropper(imgRef.current, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 1,
      checkOrientation: false,
      responsive: true,
      guides: true,
      center: true,
      highlight: true,
      background: true,
    });
    cropperRef.current = cropper;
    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [src, isSvg]);

  const rotate = (deg: number) => cropperRef.current?.rotate(deg);
  const zoom = (ratio: number) => cropperRef.current?.zoom(ratio);
  const reset = () => cropperRef.current?.reset();

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isSvg) {
        await onSave({ kind: "scale", scale: svgScale });
        return;
      }

      const cropped = cropperRef.current?.getCroppedCanvas({
        imageSmoothingQuality: "high",
      });
      if (!cropped) return;

      // Apply size percentage: draw cropped canvas onto a scaled canvas
      let canvas = cropped;
      if (sizePercent !== 100) {
        const w = Math.max(1, Math.round((cropped.width * sizePercent) / 100));
        const h = Math.max(1, Math.round((cropped.height * sizePercent) / 100));
        const scaled = document.createElement("canvas");
        scaled.width = w;
        scaled.height = h;
        scaled.getContext("2d")!.drawImage(cropped, 0, 0, w, h);
        canvas = scaled;
      }

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("canvas empty"));
            return;
          }
          try {
            await onSave({ kind: "raster", blob });
            resolve();
          } catch (e) {
            reject(e);
          }
        }, "image/png");
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={container}>
        {/* Header */}
        <div style={header}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>
            {isSvg ? "Chỉnh kích thước ảnh (SVG)" : "Chỉnh sửa ảnh"}
          </span>
          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        {/* Preview area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: "#111",
            position: "relative",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isSvg ? (
            <img
              src={src}
              alt=""
              style={{
                zoom: svgScale * 1.5,
                maxWidth: "100%",
                display: "block",
              }}
            />
          ) : (
            <img
              ref={imgRef}
              src={src}
              alt=""
              style={{ maxWidth: "100%", display: "block" }}
              crossOrigin="anonymous"
            />
          )}
        </div>

        {/* Controls */}
        <div style={controls}>
          {isSvg ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={label}>Tỉ lệ hiển thị</span>
              <input
                type="range"
                min={25}
                max={300}
                step={5}
                value={Math.round(svgScale * 100)}
                onChange={(e) => setSvgScale(Number(e.target.value) / 100)}
                style={{ flex: 1, accentColor: "#255ba7" }}
              />
              <span
                style={{
                  color: "#e0e0e0",
                  fontSize: 13,
                  minWidth: 48,
                  textAlign: "right",
                }}
              >
                {Math.round(svgScale * 100)}%
              </span>
              <button
                style={{ ...btn, padding: "4px 8px", fontSize: 11 }}
                onClick={() => setSvgScale(1)}
              >
                Reset
              </button>
            </div>
          ) : (
            <>
              <div style={controlRow}>
                {/* Rotate */}
                <div style={group}>
                  <span style={label}>Xoay</span>
                  <button style={btn} onClick={() => rotate(-90)}>
                    ↺ 90°
                  </button>
                  <button style={btn} onClick={() => rotate(90)}>
                    ↻ 90°
                  </button>
                  <button style={btn} onClick={() => rotate(-45)}>
                    ↺ 45°
                  </button>
                  <button style={btn} onClick={() => rotate(45)}>
                    ↻ 45°
                  </button>
                </div>

                {/* Zoom cropper view */}
                <div style={group}>
                  <span style={label}>Xem</span>
                  <button style={btn} onClick={() => zoom(0.1)}>
                    ＋
                  </button>
                  <button style={btn} onClick={() => zoom(-0.1)}>
                    －
                  </button>
                </div>

                {/* Reset */}
                <button style={{ ...btn, marginLeft: "auto" }} onClick={reset}>
                  Reset
                </button>
              </div>

              {/* Resize output size */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <span style={label}>Kích thước xuất</span>
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={sizePercent}
                  onChange={(e) => setSizePercent(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#255ba7" }}
                />
                <span
                  style={{
                    color: "#e0e0e0",
                    fontSize: 13,
                    minWidth: 42,
                    textAlign: "right",
                  }}
                >
                  {sizePercent}%
                </span>
                {sizePercent !== 100 && (
                  <button
                    style={{ ...btn, padding: "4px 8px", fontSize: 11 }}
                    onClick={() => setSizePercent(100)}
                  >
                    Reset
                  </button>
                )}
              </div>
            </>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <button
              onClick={onClose}
              style={{ ...btn, background: "#374151", padding: "8px 20px" }}
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...btn,
                background: "#255ba7",
                padding: "8px 20px",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const container: React.CSSProperties = {
  background: "#1e1e2e",
  borderRadius: 12,
  width: "90vw",
  maxWidth: 900,
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background: "#12121f",
  borderBottom: "1px solid #2d2d3d",
  flexShrink: 0,
};

const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#aaa",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  padding: 4,
};

const controls: React.CSSProperties = {
  padding: "12px 16px",
  background: "#12121f",
  borderTop: "1px solid #2d2d3d",
  flexShrink: 0,
};

const controlRow: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "center",
};

const group: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
};

const label: React.CSSProperties = {
  color: "#888",
  fontSize: 12,
  marginRight: 2,
};

const btn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  background: "#2d2d3d",
  color: "#e0e0e0",
  fontSize: 13,
  fontWeight: 500,
  transition: "background 0.15s",
};
