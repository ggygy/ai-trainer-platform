import {
  CircleCheck,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Lightbulb,
  Package,
  Stamp,
  Wallet,
} from "lucide-react";
import { Card, CardHead, Badge, Btn, PageHead } from "../components/ui";
import { GUIDE_LINKS, REG_CONDITIONS, REG_CHANNELS, SUBSIDIES, STUDY_TIPS } from "../data/content";
import { openExternal } from "../lib/api";
import type { PageId } from "../components/Sidebar";

// 报考指南：报名条件/渠道/补贴 + 备考资源获取与导入指引。
// 内容整理自社区攻略与官方公开通知，仅作参考——页头已标注「以官方最新通知为准」。
export default function Guide({ go }: { go: (p: PageId) => void }) {
  return (
    <div className="flex flex-col gap-4 p-7 h-full overflow-y-auto">
      <PageHead
        title="报考指南"
        sub="报名条件 · 报名渠道 · 补贴政策 · 备考资源获取与导入，一站式参考"
        right={
          <>
            <Btn onClick={() => openExternal(GUIDE_LINKS.sjtuSkill)}>
              <ExternalLink size={14} /> 官方通知与下载（交大）
            </Btn>
            <Btn primary onClick={() => go("env")}>
              <Download size={14} /> 去环境助手导入素材
            </Btn>
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-[10px] bg-warn-soft border border-warn/25 px-4 py-3">
        <Info size={15} className="text-warn shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-ink2">
          本页信息整理自社区备考攻略与上海交大高技能人才培训中心公开通知（2026-09），仅供参考；
          报名条件、材料与补贴标准请以{" "}
          <button className="text-accent underline underline-offset-2" onClick={() => openExternal(GUIDE_LINKS.sjtuNotice)}>
            官方最新通知（附件 1 为详细要求）
          </button>{" "}
          为准。
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* 左列：报名相关 */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <Card>
            <CardHead
              title="报名条件（二选一）"
              right={<Badge tone="muted">材料随报名表一并提交</Badge>}
            />
            <div className="grid grid-cols-2 gap-3">
              {REG_CONDITIONS.map((c, i) => (
                <div key={c.title} className="rounded-[10px] border border-line p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-[22px] h-[22px] rounded-full bg-accent-soft text-accent text-[11px] font-bold flex items-center justify-center font-mono">
                      {i + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-ink1">{c.title}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {c.materials.map((m) => (
                      <div key={m} className="flex items-center gap-1.5 text-[11px] text-ink2">
                        <FileText size={12} className="text-ink3 shrink-0" /> {m}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-ink3 mt-auto">{c.note}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="报名渠道（三选一）" right={<Badge tone="muted">任选其一，均可参加统一考试</Badge>} />
            <div className="flex flex-col gap-2.5">
              {REG_CHANNELS.map((ch) => (
                <div key={ch.name} className="rounded-[10px] border border-line p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Stamp size={14} className="text-accent shrink-0" />
                    <span className="text-[13px] font-semibold text-ink1">{ch.name}</span>
                    {ch.hot && <Badge>最省事 · 推荐</Badge>}
                  </div>
                  <div className="text-[11px] text-ink2 leading-relaxed">{ch.how}</div>
                  <div className="text-[10px] text-ink3 leading-relaxed mt-1">{ch.detail}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead
              title="补贴与积分（四项叠加）"
              right={<Badge tone="muted">上海地区参考</Badge>}
            />
            <div className="grid grid-cols-4 gap-3">
              {SUBSIDIES.map((s) => (
                <div key={s.k} className="rounded-[10px] bg-surface2 p-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink2">
                    <Wallet size={12} className="text-ink3 shrink-0" /> {s.k}
                  </div>
                  <div className="text-[17px] font-bold text-ink1 leading-none font-mono">{s.v}</div>
                  <div className="text-[10px] text-ink3 leading-relaxed">{s.note}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 右列：资源与备考 */}
        <div className="w-[400px] shrink-0 flex flex-col gap-4">
          <Card>
            <CardHead title="资源获取与导入" right={<Badge tone="muted">备考三件套</Badge>} />
            <div className="flex flex-col gap-3">
              <ResourceRow
                icon={<Package size={15} className="text-accent shrink-0" />}
                title="实操素材（40 题 · 约 220MB）"
                lines={[
                  "应用素材包「素材包-完整版.zip」：按本应用 40 题布局打包（随资料分享获取），导入后自动指认目录，无需手动解压",
                  "官方原始素材（三级、四级，百度网盘 · 提取码 v7xu）：原始资料布局，与本应用考卷目录不同，供对照参考",
                ]}
                links={[
                  { label: "官方素材网盘", url: GUIDE_LINKS.officialMaterials },
                  { label: "三级指导手册（zip）", url: GUIDE_LINKS.officialManual3 },
                ]}
                action={
                  <Btn className="!justify-center" onClick={() => go("env")}>
                    去导入素材
                  </Btn>
                }
              />
              <ResourceRow
                icon={<GraduationCap size={15} className="text-accent shrink-0" />}
                title="理论题库（900 题 + 官方全真卷 190 题）"
                lines={[
                  "本应用已内置：官方 900 题题库 + 官方全真卷含答案判分，无需额外下载",
                  "补充渠道：考试宝 App 首页搜「人工智能训练师三级」，筛选标签选「免费」收藏 900 题库（部分答案未必准确，以本应用为准）",
                ]}
                action={
                  <Btn className="!justify-center" onClick={() => go("learn")}>
                    去刷理论题
                  </Btn>
                }
              />
              <ResourceRow
                icon={<ClipboardList size={15} className="text-accent shrink-0" />}
                title="实操运行环境（Python + Jupyter）"
                lines={[
                  "无需自装 Anaconda：环境助手一键安装 uv 托管的 Python 3.13 + JupyterLab + 全部依赖",
                  "装完在环境助手启动 Jupyter，即可在应用内直接运行实操 Notebook",
                ]}
                action={
                  <Btn className="!justify-center" onClick={() => go("env")}>
                    去配置环境
                  </Btn>
                }
              />
            </div>
          </Card>

          <Card>
            <CardHead title="备考策略建议" right={<Lightbulb size={14} className="text-warn" />} />
            <div className="flex flex-col gap-2">
              {STUDY_TIPS.map((t) => (
                <div key={t} className="flex items-start gap-2 text-[11px] leading-relaxed text-ink2">
                  <CircleCheck size={13} className="text-ok shrink-0 mt-0.5" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ResourceRow({
  icon,
  title,
  lines,
  links,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
  links?: { label: string; url: string }[];
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-line p-3.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[13px] font-semibold text-ink1">{title}</span>
      </div>
      {lines.map((l) => (
        <div key={l} className="text-[11px] text-ink2 leading-relaxed pl-[23px]">
          {l}
        </div>
      ))}
      {links && links.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-[23px] mt-0.5">
          {links.map((l) => (
            <button
              key={l.url}
              onClick={() => openExternal(l.url)}
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline underline-offset-2"
            >
              <ExternalLink size={11} /> {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="pl-[23px] mt-0.5">{action}</div>
    </div>
  );
}
