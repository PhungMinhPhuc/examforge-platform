"use client";

import { useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

// Modal này giờ CHỈ dùng cho ảnh raster (PNG/JPG) — SVG (TikZ) là ảnh vector,
// không có gì để cắt/đổi độ phân giải, nên không mở modal này nữa (xem nút
// "Sửa ảnh" trong RichLatexEditor.tsx, đã ẩn cho img_type==='tikz'). Cỡ HIỂN
// THỊ trên trang (trước đây gọi là "scale") giờ đổi riêng bằng cụm nút
// −/%/+ ngay trên ảnh, không qua modal này — modal chỉ còn lo nội dung ảnh
// (vùng cắt, độ phân giải xuất ra), không đụng tới việc "to bao nhiêu %".
export type ImageEditResult = { blob: Blob };

interface Props {
  src: string;
  onSave: (result: ImageEditResult) => Promise<void> | void;
  onClose: () => void;
}

export default function ImageEditorModal({ src, onSave, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [saving, setSaving] = useState(false);
  const [sizePercent, setSizePercent] = useState(100);

  useEffect(() => {
    if (!imgRef.current) return;
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
  }, [src]);

  const rotate = (deg: number) => cropperRef.current?.rotate(deg);
  const zoom = (ratio: number) => cropperRef.current?.zoom(ratio);
  const reset = () => cropperRef.current?.reset();

  const handleSave = async () => {
    setSaving(true);
    try {
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
            await onSave({ blob });
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
            Cắt ảnh
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
          <img
            ref={imgRef}
            src={src}
            alt=""
            style={{ maxWidth: "100%", display: "block" }}
            crossOrigin="anonymous"
          />
        </div>

        {/* Controls */}
        <div style={controls}>
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
              style={{ flex: 1, accentColor: "#1e3faa" }}
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
                background: "#1e3faa",
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

// styles

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
