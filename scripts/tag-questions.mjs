// 900 题理论题库按官方细目章节打标 → src/data/questionTags.json
// 运行：node scripts/tag-questions.mjs
// 方法：每章配置特征关键词（源自该章细目点名称），对题干+选项做命中计分，取最高分章节。
// 输出：{ meta, judge: {id: chapter}, single: {...}, multi: {...} }
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const theory = JSON.parse(readFileSync(join(ROOT, "src/data/theory.json"), "utf8"));

// 每章特征词（分值越高的词越特征；书写依据 syllabus.json 各章细目点名称）
const RULES = {
  "0.1.1": ["职业道德", "职业素养", "道德修养", "道德品质", "职业良心", "素质", "歧视", "偏见", "道德评价"],
  "0.1.2": ["职业守则", "爱岗敬业", "诚实守信", "办事公道", "奉献社会", "服务群众", "敬业精神", "道德准则", "鞠躬尽瘁", "遵纪守法"],
  "0.2.1": ["Windows", "Word", "Excel", "PPT", "浏览器", "Office", "输入法", "快捷键", "宏", "操作系统", "办公软件", "截图", "回收站", "资源管理器"],
  "0.2.2": ["劳动合同", "劳动法", "劳动争议", "网络安全法", "专利", "著作权", "知识产权", "商标", "法律法规", "侵权", "法律", "劳动者", "用人单位", "个人信息保护", "遵纪守法", "实名", "安全保障义务", "关键信息基础设施", "网络运营者", "网络接入", "劳动保护", "劳动合同无效"],
  "1.1.1": ["ETL", "数据治理", "大数据平台", "Hadoop", "Spark", "数据仓库", "Kettle", "爬虫", "采集工具", "可视化工具", "NoSQL", "HBase", "数据中台", "Flume", "Sqoop", "Kafka", "数据质量监控", "非结构化", "数据格式转换", "云服务"],
  "1.1.2": ["采集流程", "数据源", "抓取", "采集策略", "数据集成", "实时处理", "流处理", "数据质量评估", "数据校验", "数据审计", "数据脱敏", "存储方案", "数据备份", "增量更新"],
  "1.2.1": ["推荐系统", "智能搜索", "搜索引擎", "智能交互", "自然语言处理", "生物特征", "人脸识别", "计算机视觉", "图像识别", "数据挖掘", "知识发现", "智能控制", "最优化决策", "语音识别", "机器翻译", "对话系统", "知识图谱应用"],
  "1.2.2": ["业务流程优化", "流程分析", "知识表示", "知识图谱", "业务系统", "流程再造", "流程优化", "业务分析", "效果评估指标", "业务建模"],
  "2.1.1": ["TensorFlow", "PyTorch", "Pandas", "NumPy", "Scikit", "sklearn", "数据增强", "自动化标注", "生成对抗", "GAN", "深度学习框架", "数据分片", "模型部署工具", "训练框架", "分布式训练", "GPU"],
  "2.1.2": ["缺失值", "异常值", "噪声数据", "去重", "归一化", "标准化", "白化", "特征工程", "特征提取", "训练集", "验证集", "测试集", "数据标注", "标注规范", "标注质量", "数据探索", "可追溯", "数据清洗", "数据预处理", "标注工具", "众包标注"],
  "2.2.1": ["算法训练", "损失函数", "梯度下降", "过拟合", "欠拟合", "超参数", "模型训练", "模型调优", "学习率", "批量归一化", "早停", "正则化", "模型保存", "训练监控", "容器化", "Docker"],
  "2.2.2": ["算法测试", "鲁棒性", "准确度测试", "安全性测试", "可解释性", "公平性", "测试报告", "测试框架", "测试用例", "模型评估", "评估指标", "精确率", "召回率", "F1", "混淆矩阵", "A/B测试", "回归测试", "交叉验证"],
  "3.1.1": ["数据拆解", "降维", "主成分分析", "PCA", "特征选择", "时间序列拆解", "网络分析", "社会网络", "多维尺度", "分解", "特征降维", "LDA", "奇异值"],
  "3.1.2": ["聚类分析", "关联规则", "回归分析", "决策树", "神经网络", "贝叶斯", "集成学习", "随机森林", "强化学习", "监督学习", "无监督", "半监督", "支持向量机", "SVM", "逻辑回归", "线性回归", "K均值", "K-means", "数据融合", "分类算法", "预测模型"],
  "3.1.3": ["智能解决方案", "需求分析", "产品规划", "技术选型", "系统集成", "UI设计", "用户体验", "差异化", "可扩展性", "代码审计", "故障恢复", "产品迭代", "原型", "竞品分析", "产品定位"],
  "3.2.1": ["人机交互", "交互设计", "触摸屏", "语音交互", "增强现实", "虚拟现实", "AR", "VR", "多模态", "用户研究", "原型设计", "可用性", "用户体验设计", "反馈机制", "情感化设计", "无障碍", "交互流程"],
  "3.2.2": ["Adobe XD", "Axure", "Balsamiq", "Figma", "Marvel", "Sketch", "低保真", "高保真", "原型工具", "设计系统", "线框图", "Mockup"],
  "4.1.1": ["培训讲义", "讲义", "教案", "课件"],
  "4.1.2": ["培训方法", "教学方法", "讲授法", "案例教学", "操作示范", "现场培训", "培训效果"],
  "4.2.1": ["采集流程指导", "实践指导", "采集常见问题", "采集重点", "采集难点", "数据采集和处理流程"],
  "4.2.2": ["标注流程指导", "标注规范指导", "标注问题", "标注重点", "标注难点", "标注培训", "标注流程"],
};

// 词形归一：题库原文里的变体
const ALIAS = [
  [/sklearn/gi, "Scikit"], [/scikit-learn/gi, "Scikit"], [/K-均值/g, "K均值"], [/K均值|K-均值/g, "K均值"],
];

const syllabus = JSON.parse(readFileSync(join(ROOT, "src/data/syllabus.json"), "utf8"));
// 细目点原名 → 章节（很多真题就是细目点原文的改写，精确命中计高分）
const pointIndex = []; // { name, chapter }
for (const d of syllabus.domains)
  for (const c of d.chapters)
    for (const p of c.points)
      if (p.replace(/[^\u4e00-\u9fa5A-Za-z]/g, "").length >= 4) pointIndex.push({ name: p.replace(/[（）()、，]/g, ""), chapter: c.code });

function textOf(q, withOptions) {
  let t = q.stem ?? "";
  if (withOptions && q.options) t += " " + q.options.map((o) => (Array.isArray(o) ? o[1] : o)).join(" ");
  for (const [re, to] of ALIAS) t = t.replace(re, to);
  return t;
}

const strip = (s) => s.replace(/[^\u4e00-\u9fa5A-Za-z]/g, "");

function tagAll(bank, withOptions) {
  const out = {};
  let untagged = 0;
  for (const q of bank) {
    const t = strip(textOf(q, withOptions));
    const score = {};
    for (const [code, words] of Object.entries(RULES))
      for (const w of words) if (t.includes(strip(w))) score[code] = (score[code] ?? 0) + 1;
    for (const { name, chapter } of pointIndex) if (t.includes(name)) score[chapter] = (score[chapter] ?? 0) + 3;
    const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
    if (best) out[q.id] = best[0];
    else untagged++;
  }
  return { tags: out, untagged };
}

const result = {};
let totalUntagged = 0;
for (const type of ["judge", "single", "multi"]) {
  const { tags, untagged } = tagAll(theory[type], type !== "judge");
  result[type] = tags;
  totalUntagged += untagged;
}

// 分布统计
const dist = {};
for (const type of Object.keys(result))
  for (const ch of Object.values(result[type])) dist[ch] = (dist[ch] ?? 0) + 1;

writeFileSync(
  join(ROOT, "src/data/questionTags.json"),
  JSON.stringify({ meta: { source: "关键词规则匹配 scripts/tag-questions.mjs", untagged: totalUntagged }, ...result }, null, 2) + "\n"
);

console.log(`✓ questionTags.json：未匹配 ${totalUntagged}/900`);
console.log("章节分布（judge+single+multi）:");
for (const [code, n] of Object.entries(dist).sort()) console.log(`  ${code}  ${n}`);
for (const code of Object.keys(RULES)) if (!dist[code]) console.log(`  ⚠️ ${code} 无题目命中`);
