// 平台静态内容：全部来自真实考试资料（40 题实操题库、官方复习题结构、笔记分值）

export type QuestionGroup = {
  id: string; // 题组号，如 "1.1"
  name: string;
  titles: string[]; // 真实题目名（与素材目录 HTML 对应）
  rule: string; // 抽题规则
  score: string; // 分值说明
  form: "流程" | "优化" | "代码" | "Excel" | "填空";
};

export const QUESTION_GROUPS: QuestionGroup[] = [
  {
    id: "1.1",
    name: "业务数据处理流程设计",
    rule: "5 题 · 10 抽 1",
    score: "与 1.2 共 25 分",
    form: "流程",
    titles: [
      "智能医疗系统中的业务数据处理流程设计",
      "智能农业系统中的业务数据采集和处理流程设计",
      "金融机构信用评估系统中的业务数据审核流程设计",
      "电商平台用户行为分析系统的数据采集与处理流程设计",
      "智能交通系统的数据采集、处理和审核流程设计",
    ],
  },
  {
    id: "1.2",
    name: "业务模块效果优化",
    rule: "5 题 · 10 抽 1",
    score: "与 1.1 共 25 分",
    form: "优化",
    titles: [
      "顾客评价情感识别业务模块效果优化",
      "老年人健康监测与管理服务业务模块效果优化",
      "智慧金融服务业务模块效果优化",
      "智能卖点生成系统业务模块效果优化",
      "腾讯云智能数智人系统业务模块效果优化",
    ],
  },
  {
    id: "2.1",
    name: "数据清洗和标注流程设计",
    rule: "5 题 · 5 抽 1",
    score: "代码 10 分 + 简答 5 分",
    form: "代码",
    titles: [
      "智慧交通中燃油效率模型的数据清洗和标注流程设计",
      "低碳生活行为影响因素数据清洗和标注流程设计",
      "信用评分模型数据清洗和标注流程设计",
      "医疗研究数据清洗和标注设计",
      "健康与营养咨询数据预处理与数据规范设计",
    ],
  },
  {
    id: "2.2",
    name: "模型开发与测试",
    rule: "5 题 · 5 抽 1",
    score: "代码 17 分 + 简答 3 分",
    form: "代码",
    titles: [
      "智能信用评分Logistic回归模型开发与测试",
      "智慧交通中燃油效率随机森林模型开发与测试",
      "日常运动量随机森林预测模型开发与测试",
      "低碳生活行为影响因素预测线性回归模型开发与测试",
      "智能步数预测模型开发与测试",
    ],
  },
  {
    id: "3.1",
    name: "数据分析与优化",
    rule: "5 题 · 5 抽 1",
    score: "Excel 9 分 + 简答 6 分",
    form: "Excel",
    titles: [
      "智能音箱产品的数据分析与优化",
      "智能照明系统的数据分析与优化",
      "智能健康手环的数据分析与优化",
      "智能健康监测系统的数据分析与优化",
      "智能家居环境控制系统的数据分析与优化",
    ],
  },
  {
    id: "3.2",
    name: "交互流程设计",
    rule: "5 题 · 5 抽 1",
    score: "代码 19 分 + 简答 1 分",
    form: "代码",
    titles: [
      "图像识别评估系统交互流程设计",
      "手写数字识别系统交互流程设计",
      "面部表情识别系统交互流程设计",
      "花朵智能识别系统交互流程设计",
      "人脸AI智能检测系统交互流程设计",
    ],
  },
  {
    id: "4.1",
    name: "培训大纲编写",
    rule: "5 题 · 10 抽 1",
    score: "与 4.2 共 5 分 · 填空",
    form: "填空",
    titles: [
      "Label studio培训大纲编写",
      "爬虫培训大纲编写",
      "数据清洗培训大纲编写",
      "Pandas数据清洗培训大纲编写",
      "Python数据可视化培训大纲编写",
    ],
  },
  {
    id: "4.2",
    name: "数据采集与处理指导",
    rule: "5 题 · 10 抽 1",
    score: "与 4.1 共 5 分 · 填空",
    form: "填空",
    titles: [
      "智能零售分析系统数据采集和处理指导",
      "AI辅助的医疗影像诊断系统数据采集和处理指导",
      "AI智能安防监控系统采集和处理指导",
      "自动驾驶汽车感知系统数据采集与标注指导",
      "智能化数据标注在文化遗产数字化保护中的应用指导",
    ],
  },
];

export const EXAM_INFO = {
  examDate: "2026-11-15", // 考试日期（首页倒计时据此后算）
  practical: { minutes: 120, desc: "从 8 个题组共 40 题中抽题 · 最多 4 个代码题 + Excel 操作" },
  theory: { minutes: 90, counts: "140 单选 + 10 多选 + 40 判断 = 190 题" },
  passLine: 60,
  fee: "500 元（理论 100 / 实操 400），单科可补考，有效期两年",
};

// 实操题运行依赖（来源：40 题 notebook 的 import 统计）
export type DepItem = { pip: string; use: string; version: string };
export const DEPENDENCIES: DepItem[] = [
  { pip: "python", use: "系统运行时", version: "3.11+" },
  { pip: "pip", use: "包管理器", version: "24+" },
  { pip: "jupyterlab", use: "Notebook 服务", version: "4+" },
  { pip: "pandas", use: "数据处理", version: "2.2" },
  { pip: "numpy", use: "数值计算", version: "1.26" },
  { pip: "scikit-learn", use: "机器学习建模", version: "1.4" },
  { pip: "matplotlib", use: "统计可视化绘图", version: "3.8" },
  { pip: "onnxruntime", use: "ONNX 模型推理", version: "1.17" },
  { pip: "Pillow", use: "图像读取处理", version: "10.2" },
  { pip: "opencv-python", use: "图像处理（cv2）", version: "4.9" },
  { pip: "xgboost", use: "梯度提升模型", version: "2.0" },
  { pip: "seaborn", use: "统计可视化", version: "0.13" },
  { pip: "imbalanced-learn", use: "类别不平衡采样（SMOTE）", version: "0.12" },
];
// pip 检测名 → import 名差异
export const PIP_IMPORT_ALIAS: Record<string, string> = {
  "opencv-python": "cv2",
  Pillow: "PIL",
  "imbalanced-learn": "sklearn",
  "scikit-learn": "sklearn",
};

// 按题组类型生成练习要求（与真实考点对齐）
export function taskSteps(groupId: string): string[] {
  switch (groupId) {
    case "1.1":
      return [
        "梳理业务场景，明确数据采集的对象、范围与来源",
        "设计数据采集流程（爬虫 / API / 人工录入）并说明工具选择",
        "设计数据清洗与审核流程，明确质量校验规则",
        "绘制业务数据处理流程图，标注各环节输入输出",
      ];
    case "1.2":
      return [
        "分析业务模块当前效果与评价指标（准确率 / 转化率等）",
        "定位效果瓶颈，提出至少 3 条优化策略",
        "设计效果验证方案（A/B 对比、评估指标）",
        "输出优化报告与后续迭代计划",
      ];
    case "2.1":
      return [
        "读取原始数据集，完成缺失值识别与处理",
        "完成异常值检测（3σ / 箱线图）与处理",
        "完成类别特征编码与数值特征规范化",
        "制定标注规范并完成数据标注",
        "简答：说明数据清洗各步骤对建模质量的影响",
      ];
    case "2.2":
      return [
        "读取数据并完成预处理（缺失值 / 编码 / 标准化）",
        "按 8:2 划分训练集与测试集",
        "训练题目指定模型（Logistic / 随机森林 / 线性回归）",
        "输出测试集评估指标（准确率 / RMSE / 混淆矩阵）",
        "将模型保存为 .pkl 文件",
      ];
    case "3.1":
      return [
        "打开素材 Excel，检查数据完整性与格式",
        "使用公式 / 数据透视完成指标统计",
        "按题目要求完成分列、筛选与条件格式",
        "制作分析图表并撰写优化结论",
        "简答：说明分析结论与优化建议",
      ];
    case "3.2":
      return [
        "分析智能系统的用户交互场景与功能需求",
        "设计交互流程（状态流转图：唤醒 → 识别 → 执行 → 反馈）",
        "定义异常场景处理策略（识别失败、多轮对话等）",
        "输出交互流程设计文档",
      ];
    case "4.1":
      return [
        "确定培训对象、目标与课时安排",
        "按模块编写培训大纲（每模块：知识点 + 实操 + 考核方式）",
        "补全题目要求的无标题填空（共 5 空）",
      ];
    case "4.2":
      return [
        "分析目标系统的数据采集需求（数据类型、来源、量级）",
        "制定数据采集与处理流程规范",
        "制定标注规范与质量控制方案",
        "补全题目要求的无标题填空（共 5 空）",
      ];
    default:
      return [];
  }
}

// 理论学习知识体系：直接采用官方《认定要素细目表》结构（5 大项 / 21 章节 / 300 细目点，带分值）
import syllabusRaw from "./syllabus.json";
import lessonsRaw from "./lessons.json";
import tagsRaw from "./questionTags.json";
import theoryRaw from "./theory.json";

export const SYLLABUS = syllabusRaw as unknown as {
  meta: { source: string; totalPoints: number; totalScore: number };
  domains: { code: string; name: string; score: number; chapters: { code: string; name: string; unit: string; score: number; points: string[] }[] }[];
};

export const QUESTION_TAGS = tagsRaw as unknown as {
  meta: { source: string; untagged: number };
  judge: Record<string, string>;
  single: Record<string, string>;
  multi: Record<string, string>;
};

const theoryBank = theoryRaw as unknown as {
  judge: { id: number; stem: string }[];
  single: { id: number; stem: string; options: [string, string][] }[];
  multi: { id: number; stem: string; options: [string, string][] }[];
};

export type Lesson = {
  code: string; // 章节代码 "3.1.1"
  unit: string; // 所属单元 "3.1 智能系统监控和优化"
  title: string;
  score: number; // 官方分值
  pointCount: number; // 官方细目点数
  body: string;
  keyPoints: string[];
  tags: string[]; // 页面标签（含例题数，运行时拼装）
};

const lessonData = lessonsRaw as unknown as {
  meta: { source: string };
  lessons: Record<string, { title: string; body: string; keyPoints: string[] }>;
};

/** 章节例题池 = 全量题库 900 题：本章打标真题按「单选/判断/多选」交错排最前，其余题目交错续后 */
export type QuizQuestion = { type: "judge" | "single" | "multi"; id: number };

export function chapterTaggedCount(code: string): number {
  let n = 0;
  for (const type of ["judge", "single", "multi"] as const)
    for (const t of Object.values(QUESTION_TAGS[type])) if (t === code) n++;
  return n;
}

export function lessonQuiz(code: string): QuizQuestion[] {
  const pools: Record<"judge" | "single" | "multi", { chapter: number[]; rest: number[] }> = {
    judge: { chapter: [], rest: [] },
    single: { chapter: [], rest: [] },
    multi: { chapter: [], rest: [] },
  };
  for (const type of ["judge", "single", "multi"] as const)
    for (const q of theoryBank[type])
      (QUESTION_TAGS[type][String(q.id)] === code ? pools[type].chapter : pools[type].rest).push(q.id);

  const roundRobin = (p: Record<"judge" | "single" | "multi", number[]>) => {
    const out: QuizQuestion[] = [];
    for (let i = 0; ; i++) {
      let any = false;
      for (const type of ["single", "judge", "multi"] as const) {
        const id = p[type][i];
        if (id !== undefined) {
          out.push({ type, id });
          any = true;
        }
      }
      if (!any) return out;
    }
  };
  const chapterPart = roundRobin({ judge: pools.judge.chapter, single: pools.single.chapter, multi: pools.multi.chapter });
  const used = new Set(chapterPart.map((q) => q.type + q.id));
  const restPart = roundRobin({ judge: pools.judge.rest, single: pools.single.rest, multi: pools.multi.rest }).filter(
    (q) => !used.has(q.type + q.id)
  );
  return [...chapterPart, ...restPart];
}

export const LESSON_SOURCE_NOTE = "本讲义依据官方《认定要素细目表》细目点与真题提炼编写（非官方教材原文）；下方细目点清单为官方原文。";

// 由 syllabus + lessons.json 组装课程表（21 章全部有课）
export const LESSONS: Record<string, Lesson> = {};
for (const d of SYLLABUS.domains)
  for (const c of d.chapters) {
    const l = lessonData.lessons[c.code];
    if (!l) throw new Error(`章节 ${c.code} 缺少课程内容（lessons.json）`);
    const taggedN = chapterTaggedCount(c.code);
    LESSONS[c.code] = {
      code: c.code,
      unit: c.unit,
      title: l.title,
      score: c.score,
      pointCount: c.points.length,
      body: l.body,
      keyPoints: l.keyPoints,
      tags: [`官方分值 ${c.score} 分`, `细目点 ${c.points.length} 个`, `本章真题 ${taggedN} 道 · 全库可刷`, `所属大项 · ${d.name}`],
    };
  }

export type KnowledgeNode = {
  id: string;
  code: string; // "3"（大项）或 "3.1.1"（章节）
  name: string;
  level: 1 | 2;
  score: number; // 官方分值
  taggedCount?: number; // level2：本章打标真题数
  pointCount?: number;
};
export const KNOWLEDGE_TREE: KnowledgeNode[] = SYLLABUS.domains.flatMap((d) => [
  { id: d.code, code: d.code, name: d.name, level: 1 as const, score: d.score },
  ...d.chapters.map((c) => ({
    id: c.code,
    code: c.code,
    name: c.name,
    level: 2 as const,
    score: c.score,
    taggedCount: chapterTaggedCount(c.code),
    pointCount: c.points.length,
  })),
]);

