// 实操素材包导入：选 zip → 后端校验解压 → 落到应用素材目录
// 素材 zip 走百度网盘分发（不进安装包），用桌面随应用说明提供的「素材包-完整版.zip」
import { open } from "@tauri-apps/plugin-dialog";
import { invoke, isTauri } from "./api";

export type ImportOutcome = {
  ok: boolean;
  dir: string;
  questions: number;
  message: string;
};

/** 弹文件选择框并导入；用户取消返回 null，失败/成功返回 outcome（message 可直接展示） */
export async function pickAndImportMaterials(): Promise<ImportOutcome | null> {
  if (!isTauri()) return null;
  const file = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "素材包", extensions: ["zip"] }],
    title: "选择素材包（.zip）",
  });
  if (typeof file !== "string") return null;
  return invoke<ImportOutcome>("import_materials", { zipPath: file });
}

/** 应用素材目录（导入落点；启动时用于默认迁移判断） */
export async function materialDir(): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("material_dir");
}
