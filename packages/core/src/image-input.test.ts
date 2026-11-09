import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadImage, imageUrls, resolveImageInput } from "./image-input.js";

afterEach(() => vi.unstubAllGlobals());

describe("uploadImage", () => {
  it("posts the data URL to UploadFile and returns an ImageFile annotation", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ docId: "doc-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const a = await uploadImage("tok", "conv-1", "data:image/jpeg;base64,/9j/");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://substrate.office.com/m365Copilot/UploadFile");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("FileBase64")).toBe("data:image/jpeg;base64,/9j/");
    expect(form.get("conversationId")).toBe("conv-1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(a).toMatchObject({ id: "doc-1", messageAnnotationType: "ImageFile", messageAnnotationMetadata: { fileType: "jpg" } });
  });

  it("fails loudly on a refusal, a missing docId, or something that isn't an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    await expect(uploadImage("t", "c", "data:image/png;base64,AA")).rejects.toThrow("UploadFile 403");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(uploadImage("t", "c", "data:image/png;base64,AA")).rejects.toThrow("no docId");
    await expect(uploadImage("t", "c", "https://example.com/a.png")).rejects.toThrow("data URL");
  });
});

describe("imageUrls", () => {
  it("collects user and OpenAI-format tool-result image parts in order", () => {
    expect(imageUrls([
      { role: "user", content: "hi" },
      { role: "user", content: [{ type: "text", text: "two" }, { type: "image_url", image_url: { url: "data:image/png;base64,A" } }] },
      { role: "tool", tool_call_id: "read-1", content: [{ type: "text", text: "image result" }, { type: "image_url", image_url: { url: "https://example.test/tool.png" } }] },
      { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,B" } }] },
    ])).toEqual(["data:image/png;base64,A", "https://example.test/tool.png", "data:image/png;base64,B"]);
  });

  it("fetches an HTTP image and preserves its original PNG dimensions", async () => {
    const png = Buffer.alloc(24);
    Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(png);
    png.writeUInt32BE(2048, 16);
    png.writeUInt32BE(2732, 20);
    const fetch = vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetch);
    const { dataUrl, width, height } = await resolveImageInput("https://example.test/screen.png");
    expect(fetch).toHaveBeenCalledWith("https://example.test/screen.png");
    expect(dataUrl).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect({ width, height }).toEqual({ width: 2048, height: 2732 });
  });

  it("reads dimensions from a PNG data URL", async () => {
    const png = Buffer.alloc(24);
    Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(png);
    png.writeUInt32BE(1024, 16);
    png.writeUInt32BE(768, 20);
    const resolved = await resolveImageInput(`data:image/png;base64,${png.toString("base64")}`);
    expect(resolved).toMatchObject({ width: 1024, height: 768 });
  });
});
