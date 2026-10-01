"use client";

import { useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { Icon } from "@/components/icons";

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
    <div className="ui-modal-backdrop ui-modal-backdrop--image">
      <section className="ui-modal ui-modal--image-editor" role="dialog" aria-modal="true" aria-labelledby="image-editor-title">
        <header className="ui-modal__header">
          <div className="ui-modal__heading"><h2 className="ui-modal__title" id="image-editor-title">Cắt ảnh</h2></div>
          <button className="ui-modal__close" type="button" aria-label="Đóng" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        {/* Preview area */}
        <div className="ui-modal__image-workspace">
          <img
            ref={imgRef}
            src={src}
            alt=""
            crossOrigin="anonymous"
          />
        </div>

        {/* Controls */}
        <div className="ui-modal__controls">
          <div className="ui-modal__control-row">
            {/* Rotate */}
            <div className="ui-modal__control-group">
              <span className="ui-modal__control-label">Xoay</span>
              <button className="ui-button ui-button--secondary ui-button--small" type="button" onClick={() => rotate(-90)}>
                <Icon name="rotate-ccw" /> 90°
              </button>
              <button className="ui-button ui-button--secondary ui-button--small" type="button" onClick={() => rotate(90)}>
                <Icon name="rotate-cw" /> 90°
              </button>
              <button className="ui-button ui-button--secondary ui-button--small" type="button" onClick={() => rotate(-45)}>
                <Icon name="rotate-ccw" /> 45°
              </button>
              <button className="ui-button ui-button--secondary ui-button--small" type="button" onClick={() => rotate(45)}>
                <Icon name="rotate-cw" /> 45°
              </button>
            </div>

            {/* Zoom cropper view */}
            <div className="ui-modal__control-group">
              <span className="ui-modal__control-label">Xem</span>
              <button className="ui-button ui-button--secondary ui-button--icon ui-button--small" type="button" aria-label="Phóng to" onClick={() => zoom(0.1)}>
                <Icon name="zoom-in" />
              </button>
              <button className="ui-button ui-button--secondary ui-button--icon ui-button--small" type="button" aria-label="Thu nhỏ" onClick={() => zoom(-0.1)}>
                <Icon name="zoom-out" />
              </button>
            </div>

            {/* Reset */}
            <button className="ui-button ui-button--secondary ui-button--small" type="button" onClick={reset}>
              Reset
            </button>
          </div>

          {/* Resize output size */}
          <div className="ui-modal__range-row">
            <span className="ui-modal__control-label">Kích thước xuất</span>
            <input
              type="range"
              min={10}
              max={200}
              step={5}
              value={sizePercent}
              onChange={(e) => setSizePercent(Number(e.target.value))}
            />
            <span className="ui-modal__range-value">
              {sizePercent}%
            </span>
            {sizePercent !== 100 && (
              <button
                className="ui-button ui-button--secondary ui-button--small"
                type="button"
                onClick={() => setSizePercent(100)}
              >
                Reset
              </button>
            )}
          </div>

          <div className="ui-modal__footer" style={{ padding: 0, borderTop: 0 }}>
            <button className="ui-button ui-button--secondary" type="button" onClick={onClose}>
              Hủy
            </button>
            <button className="ui-button ui-button--primary" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

