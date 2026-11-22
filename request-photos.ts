import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const photoDirectory = path.resolve(import.meta.dirname, "../../uploads/request-photos");
const maxPhotoBytes = 1_500_000;

export class PhotoValidationError extends Error {}

const imageTypes = {
  jpeg: { mime: "image/jpeg", extension: "jpg", signature: (data: Buffer) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  png: { mime: "image/png", extension: "png", signature: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  webp: { mime: "image/webp", extension: "webp", signature: (data: Buffer) => data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" },
};

export async function saveRequestPhoto(dataUrl: unknown) {
  if (typeof dataUrl !== "string") throw new PhotoValidationError("กรุณาแนบรูปภาพอุปกรณ์");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new PhotoValidationError("รองรับรูปภาพ JPG, PNG หรือ WebP เท่านั้น");
  const type = imageTypes[match[1] as keyof typeof imageTypes];
  const data = Buffer.from(match[2], "base64");
  if (data.length === 0 || data.length > maxPhotoBytes) {
    throw new PhotoValidationError("รูปภาพต้องมีขนาดไม่เกิน 1.5 MB");
  }
  if (!type.signature(data)) throw new PhotoValidationError("ไฟล์รูปภาพไม่ถูกต้อง");

  await mkdir(photoDirectory, { recursive: true });
  const filename = `${randomUUID()}.${type.extension}`;
  await writeFile(path.join(photoDirectory, filename), data, { flag: "wx" });
  return filename;
}

export async function readRequestPhoto(filename: string) {
  if (!/^[\da-f-]+\.(jpg|png|webp)$/i.test(filename)) throw new Error("ไฟล์รูปภาพไม่ถูกต้อง");
  const data = await readFile(path.join(photoDirectory, filename));
  const extension = path.extname(filename).toLowerCase();
  const contentType = extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : "image/webp";
  return { data, contentType };
}

export async function removeRequestPhoto(filename: string) {
  await unlink(path.join(photoDirectory, filename));
}
