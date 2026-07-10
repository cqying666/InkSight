/**
 * 全格式文件解析器 (P2-T2 改造)
 *
 * 支持策略：
 *  - 纯文本类（.txt/.md/.markdown/.json/.csv/.tsv/.html/.htm/.xml/.log/.text/.org/.rst/.rtf 等）：
 *    直接 read as UTF-8；RTF 额外剥控制字
 *  - .docx：mammoth 提取纯文本
 *  - .pdf：pdfjs-dist 逐页提取文本
 *  - 其他二进制（.doc/.wps 等）：尽力读为文本，若前 1KB 含控制字符则判为不可读，
 *    提示用户转 .txt/.docx/.pdf
 *
 * 所有解析在浏览器端完成，文件不上传服务器。
 * mammoth / pdfjs 通过动态 import 按需加载，不进入首屏 bundle。
 */

export interface ParseResult {
  text: string;
  format: string;
  /** 解析器名称，用于 UI 展示 */
  parser: "text" | "rtf" | "docx" | "pdf" | "fallback";
}

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "text",
  "json",
  "csv",
  "tsv",
  "html",
  "htm",
  "xml",
  "log",
  "org",
  "rst",
  "ascii",
  "plain",
]);

function getExt(fileName: string): string {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

/** 判断文本前 1KB 是否含大量控制字符（二进制特征） */
function looksBinary(sample: string): boolean {
  const ctrl = (sample.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  return ctrl > sample.length * 0.05;
}

/** 剥离 RTF 控制字，保留可见文本 */
function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\line/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\u-?\d+\??/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = getExt(file.name);
  const mime = file.type;

  // ===== 1. RTF =====
  if (ext === "rtf" || mime === "application/rtf") {
    const raw = await file.text();
    return { text: stripRtf(raw), format: "rtf", parser: "rtf" };
  }

  // ===== 2. DOCX (mammoth) =====
  if (
    ext === "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      // @ts-expect-error mammoth.browser has no types
      const mammoth = (await import("mammoth/mammoth.browser")).default;
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = (result?.value || "").trim();
      if (!text) {
        throw new Error("文档内容为空，可能仅含图片或扫描页");
      }
      return { text, format: "docx", parser: "docx" };
    } catch (e) {
      throw new Error(
        `解析 .docx 失败：${e instanceof Error ? e.message : String(e)}。请尝试另存为 .txt`
      );
    }
  }

  // ===== 3. PDF (pdfjs-dist) =====
  if (ext === "pdf" || mime === "application/pdf") {
    try {
      const pdfjs = await import("pdfjs-dist");
      // 用 CDN worker 避免本地 worker 配置；版本与 pdfjs 绑定
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
      });
      const pdf = await loadingTask.promise;
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? (item as { str: string }).str : ""))
          .join(" ");
        parts.push(pageText);
      }
      const text = parts.join("\n\n").trim();
      if (!text) {
        throw new Error("PDF 未提取到文本，可能是扫描版图片（无文字层）");
      }
      return { text, format: "pdf", parser: "pdf" };
    } catch (e) {
      throw new Error(
        `解析 .pdf 失败：${e instanceof Error ? e.message : String(e)}。若是扫描版请先用 OCR 转文本`
      );
    }
  }

  // ===== 4. 纯文本类 =====
  if (TEXT_EXTS.has(ext) || mime.startsWith("text/")) {
    const text = await file.text();
    return { text, format: ext || "txt", parser: "text" };
  }

  // ===== 5. 未知格式：尽力读文本，乱码则提示 =====
  try {
    const text = await file.text();
    if (looksBinary(text.slice(0, 1024))) {
      throw new Error(
        `暂不支持 .${ext || "未知"} 格式的二进制文件，请转为 .txt / .docx / .pdf 后上传`
      );
    }
    return { text, format: ext || "txt", parser: "fallback" };
  } catch (e) {
    if (e instanceof Error && e.message.includes("暂不支持")) throw e;
    throw new Error(
      `暂不支持 .${ext || "未知"} 格式，请转为 .txt / .docx / .pdf 后上传`
    );
  }
}

/** 友好的格式说明，用于 UI */
export const SUPPORTED_FORMAT_HINT =
  "支持 .txt / .md / .docx / .pdf / .rtf / .html / .json 等所有文本类格式";
