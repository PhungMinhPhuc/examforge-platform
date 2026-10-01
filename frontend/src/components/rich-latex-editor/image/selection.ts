export function selectImage(surface: HTMLElement, image: HTMLElement | null) {
  surface
    .querySelectorAll(".rle-image[data-rle-selected]")
    .forEach((element) => element.removeAttribute("data-rle-selected"));
  if (image) image.setAttribute("data-rle-selected", "true");
  return image;
}

export function deleteSelectedImage(image: HTMLElement | null) {
  if (!image) return false;
  image.remove();
  return true;
}
export function copySelectedImage(image: HTMLElement | null) {
  return image?.outerHTML ?? null;
}

