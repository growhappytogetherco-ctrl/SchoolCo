import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { LOGIN_CONFIG } from "@/lib/login-config";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function GET() {
  try {
    const dir = join(process.cwd(), "public", "login");
    const files = await readdir(dir);
    let images = files
      .filter(f => IMAGE_EXTS.has(f.toLowerCase().slice(f.lastIndexOf("."))))
      .map(f => `/login/${f}`);

    // Honour defaultImage first
    if (LOGIN_CONFIG.defaultImage) {
      const def = `/login/${LOGIN_CONFIG.defaultImage}`;
      images = [def, ...images.filter(i => i !== def)];
    }

    // Shuffle if configured
    if (LOGIN_CONFIG.randomOrder) {
      for (let i = images.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [images[i], images[j]] = [images[j], images[i]];
      }
    }

    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
