export function isPreviewMode() {
  return process.env.ROUTE_A_PREVIEW_MODE === "demo";
}

export function isPreviewClientMode() {
  return process.env.NEXT_PUBLIC_ROUTE_A_PREVIEW_MODE === "demo";
}
