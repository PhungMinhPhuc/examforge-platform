import {
  useLayoutEffect,
  type CSSProperties,
  type CompositionEventHandler,
  type FocusEventHandler,
  type FormEventHandler,
  type MouseEventHandler,
  type RefObject,
} from "react";
import styles from "../styles/surface.module.css";

export function syncRenderedImageAtoms(surface: HTMLElement, html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const renderedById = new Map<string, HTMLElement[]>();
  template.content
    .querySelectorAll<HTMLElement>(".rle-image")
    .forEach((image) => {
      const id = image.dataset.figureId ?? "";
      const matches = renderedById.get(id) ?? [];
      matches.push(image);
      renderedById.set(id, matches);
    });
  const offsets = new Map<string, number>();
  surface.querySelectorAll<HTMLElement>(".rle-image").forEach((current) => {
    const id = current.dataset.figureId ?? "";
    const offset = offsets.get(id) ?? 0;
    offsets.set(id, offset + 1);
    const rendered = renderedById.get(id)?.[offset];
    if (!rendered) return;

    const selected = current.getAttribute("data-rle-selected");
    Array.from(current.attributes).forEach((attribute) => {
      if (
        attribute.name !== "data-rle-selected" &&
        !rendered.hasAttribute(attribute.name)
      )
        current.removeAttribute(attribute.name);
    });
    Array.from(rendered.attributes).forEach((attribute) =>
      current.setAttribute(attribute.name, attribute.value),
    );
    if (selected != null) current.setAttribute("data-rle-selected", selected);
    if (current.innerHTML !== rendered.innerHTML)
      current.replaceChildren(
        ...Array.from(rendered.childNodes, (node) => node.cloneNode(true)),
      );
  });
}

type Props = {
  surfaceRef: RefObject<HTMLDivElement | null>;
  html: string;
  syncHtml: boolean | (() => boolean);
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  onInput: FormEventHandler<HTMLDivElement>;
  onCompositionStart?: CompositionEventHandler<HTMLDivElement>;
  onCompositionEnd?: CompositionEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onClick: MouseEventHandler<HTMLDivElement>;
};

export function EditorSurface({
  surfaceRef,
  html,
  syncHtml,
  placeholder,
  minHeight,
  maxHeight,
  onInput,
  onCompositionStart,
  onCompositionEnd,
  onBlur,
  onClick,
}: Props) {
  const size = {
    "--rle-min-height": minHeight,
    "--rle-max-height": maxHeight,
  } as CSSProperties;
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const shouldSyncHtml =
      typeof syncHtml === "function" ? syncHtml() : syncHtml;
    if (shouldSyncHtml) {
      if (surface.innerHTML !== html) surface.innerHTML = html;
      return;
    }
    // A semantic parent echo must not replace the editable DOM/caret. Image
    // metadata is external to TreeDoc, though, so patch those atomic nodes.
    syncRenderedImageAtoms(surface, html);
  }, [html, surfaceRef, syncHtml]);
  return (
    <div
      ref={surfaceRef}
      className={styles.surface}
      style={size}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={onInput}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onBlur={onBlur}
      onClick={onClick}
    />
  );
}
