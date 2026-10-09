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

// 理论学习知识体系（依据官方认定要素细目表结构）
export type KnowledgeNode = {
  id: string;
  name: string;
  level: 1 | 2;
  progress?: [number, number];
};
export const KNOWLEDGE_TREE: KnowledgeNode[] = [
  { id: "k1", name: "职业道德与基础知识", level: 1 },
  { id: "k1-1", name: "职业道德基本守则", level: 2 },
  { id: "k1-2", name: "法律法规与知识产权", level: 2 },
  { id: "k1-3", name: "计算机与网络基础", level: 2 },
  { id: "k2", name: "数据采集与处理", level: 1 },
  { id: "k2-1", name: "业务数据采集流程", level: 2 },
  { id: "k2-2", name: "数据清洗与标注", level: 2 },
  { id: "k2-3", name: "数据审核与脱敏", level: 2 },
  { id: "k3", name: "业务分析与效果优化", level: 1 },
  { id: "k3-1", name: "业务需求分析", level: 2 },
  { id: "k3-2", name: "数据处理流程设计", level: 2 },
  { id: "k4", name: "数据标注与模型训练", level: 1 },
  { id: "k4-1", name: "标注规范与质量控制", level: 2 },
  { id: "k4-2", name: "经典模型原理与应用", level: 2 },
  { id: "k5", name: "智能系统运维与优化", level: 1 },
  { id: "k5-1", name: "系统交互流程设计", level: 2 },
  { id: "k5-2", name: "培训与指导", level: 2 },
];

export type Lesson = {
  id: string;
  crumb: string;
  title: string;
  tags: string[];
  body: string;
  points: string[];
  quizId: string; // 关联理论题库中的题目（single 区第 N 题）
};
export const LESSONS: Record<string, Lesson> = {
  "k2-2": {
    id: "k2-2",
    crumb: "理论学习 / 数据采集与处理 / 数据清洗与标注",
    title: "数据清洗与标注流程设计",
    tags: ["难度 中等", "预计 12 分钟", "配套例题 5 道", "对应考纲 · 数据清洗和标注流程"],
    body: "数据清洗是业务数据处理流程中的关键环节，目的是识别并处理缺失值、异常值、重复数据和不一致数据，为后续的标注与建模提供高质量数据源。清洗流程一般遵循「审查 → 处理 → 验证 → 记录」四个步骤。",
    points: [
      "缺失值处理：删除、均值/中位数/众数填充、保留缺失标记三种策略的适用场景",
      "异常值检测：3σ 原则与箱线图 IQR 法；处理前必须先区分真异常与录入错误",
      "标注规范：制定标注指南、双人背靠背标注 + 仲裁机制，保证标注一致性",
    ],
    quizId: "single-1",
  },
  "k4-2": {
    id: "k4-2",
    crumb: "理论学习 / 数据标注与模型训练 / 经典模型",
    title: "经典模型原理与应用",
    tags: ["难度 中等", "预计 15 分钟", "配套例题 5 道", "对应考纲 · 模型开发与测试"],
    body: "三级实操重点考察 Logistic 回归、线性回归与随机森林三类模型。逻辑回归用于二分类（如信用评分），线性回归用于数值预测（如燃油效率），随机森林可兼顾分类与回归且对特征标准化不敏感。建模通用流程：读取数据 → 预处理 → 划分数据集 → 训练 → 评估 → 保存模型。",
    points: [
      "train_test_split(test_size=0.2) 固定 random_state 保证可复现",
      "分类看准确率/混淆矩阵，回归看 RMSE/MAE",
      "joblib.dump(model, 'model.pkl') 保存模型，考试常考",
    ],
    quizId: "single-2",
  },
  "k5-1": {
    id: "k5-1",
    crumb: "理论学习 / 智能系统运维 / 交互流程",
    title: "智能系统交互流程设计",
    tags: ["难度 较易", "预计 10 分钟", "配套例题 5 道", "对应考纲 · 交互流程设计"],
    body: "交互流程设计考察智能系统（图像识别、语音助手、人脸检测等）从用户输入到系统反馈的完整状态流转。标准框架：触发 → 采集 → 识别/推理 → 结果反馈 → 异常处理。每个环节需明确输入、输出、超时与失败降级策略。",
    points: [
      "识别失败的降级路径（重试 → 换交互方式 → 转人工）",
      "隐私合规：人脸等生物特征数据的采集须单独告知并取得授权",
      "性能指标：响应时延、识别准确率、并发能力",
    ],
    quizId: "single-3",
  },
};
