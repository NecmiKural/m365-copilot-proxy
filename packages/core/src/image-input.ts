import { randomUUID } from "node:crypto";
import { createLogger } from "./log.js";
import type { Message } from "./tools.js";

const log = createLogger("image-input");

// Image input (vision, #39). The web client uploads a pasted image to
// `/m365Copilot/UploadFile`, gets a `docId` back, and points the next chat
// message at it with an `ImageFile` annotation — the same flow Microsoft's PyRIT
// replicates (docs/hypotheses.md H8.10). The upload is keyed to the conversation.
// The chat turn needs nothing else: no GPT-V optionsSets, and the tool agent
// sees the image too (§33 F86).
const UPLOAD_URL = "https://substrate.office.com/m365Copilot/UploadFile";

export interface ImageAnnotation {
  id: string;
  messageAnnotationMetadata: { "@type": "File"; annotationType: "File"; fileType: string; fileName: string };
  messageAnnotationType: "ImageFile";
}

export interface ResolvedImageInput {
  dataUrl: string;
  width?: number;
  height?: number;
}

function pngDimensions(data: Buffer): Pick<ResolvedImageInput, "width" | "height"> {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  if (data.length >= 24 && data.subarray(0, 8).equals(signature) && data.toString("ascii", 12, 16) === "IHDR") {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  return {};
}

const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Normalize an OpenAI image URL for M365's data-URL-only upload endpoint.
 * HTTP bytes are copied without resizing; PNG dimensions are retained as
 * explicit model context because the upstream vision service may rescale them. */
export async function resolveImageInput(url: string): Promise<ResolvedImageInput> {
  let dataUrl = url;
  let data: Buffer;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
    data = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  } else if (/^https?:\/\//i.test(url)) {
    // Bounded so a slow or oversized URL cannot stall or bloat the proxy.
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const contentType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType?.startsWith("image/")) throw new Error("image URL did not return an image");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("image too large");
    data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_IMAGE_BYTES) throw new Error("image too large");
    dataUrl = `data:${contentType};base64,${data.toString("base64")}`;
  } else {
    throw new Error("image URL must be an image data URL or http(s) URL");
  }
  return { dataUrl, ...pngDimensions(data) };
}

/** Upload one image (a `data:image/...;base64,` URL) and return the annotation
 *  that attaches it to a chat message. */
export async function uploadImage(token: string, conversationId: string, dataUrl: string): Promise<ImageAnnotation> {
  const type = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(dataUrl)?.[1]?.toLowerCase();
  if (!type) throw new Error("not a base64 image data URL");
  const form = new URLSearchParams({ scenario: "UploadImage", conversationId, FileBase64: dataUrl });
  for (const o of ["cwcgptvsan", "flux_v3_gptv_enable_upload_multi_image_in_turn_wo_ch"]) form.append("optionsSets", o);
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Scenario": "OfficeWebIncludedCopilot",
      "X-Variants": "feature.EnableImageSupportInUploadFile",
      Origin: "https://m365.cloud.microsoft",
      Referer: "https://m365.cloud.microsoft/",
    },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`UploadFile ${res.status}: ${body.slice(0, 200)}`);
  let docId: string | undefined;
  try { docId = JSON.parse(body).docId; } catch {}
  if (!docId) throw new Error(`UploadFile returned no docId: ${body.slice(0, 200)}`);
  const fileType = type === "jpeg" ? "jpg" : type.replace(/\+.*$/, "");
  log.info(`Uploaded ${fileType} image (${dataUrl.length} chars) → docId ${docId}`);
  return {
    id: docId,
    messageAnnotationMetadata: { "@type": "File", annotationType: "File", fileType, fileName: `image-${randomUUID().slice(0, 8)}.${fileType}` },
    messageAnnotationType: "ImageFile",
  };
}

/** The image data URLs in these messages, in order (OpenAI `image_url` parts). */
export function imageUrls(messages: Message[]): string[] {
  return messages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.flatMap((p) => (p.type === "image_url" && typeof p.image_url?.url === "string" ? [p.image_url.url] : []))
      : [],
  );
}
