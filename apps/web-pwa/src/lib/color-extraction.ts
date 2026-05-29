/**
 * 基于书名哈希生成稳定互补、符合漫反射（柔和宣纸感）特征的 HSL 双色渐变配方
 * 100% 规避 Canvas-CORS 图片跨域污染，完美保障无网络成本的物理真彩提取
 */
export interface ExtractedColors {
  color1: string;     // 主色 HSL (用于渐变起点)
  color2: string;     // 互补色 HSL (用于渐变终点)
  textColor: string;  // 深色微调文本色 (确保可读性)
  borderColor: string;// 微润的契合边框色
  accentColor: string;// 主相核心色 (可点缀细节)

  // 补全别名以优雅契合书籍详情页 (book/[bookId]/page.tsx)
  bgGradStart: string;
  bgGradEnd: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
}

export function extractColorsFromTitle(title: string): ExtractedColors {
  if (!title) {
    const bgGradStart = "hsl(35, 30%, 96%)";
    const bgGradEnd = "hsl(35, 15%, 90%)";
    const textColor = "hsl(35, 45%, 20%)";
    const borderColor = "rgba(80, 65, 45, 0.12)";
    const accentColor = "hsl(35, 30%, 40%)";
    const muted = "hsl(35, 25%, 45%)";
    return {
      color1: bgGradStart,
      color2: bgGradEnd,
      textColor,
      borderColor,
      accentColor,
      bgGradStart,
      bgGradEnd,
      text: textColor,
      muted,
      border: borderColor,
      accent: accentColor
    };
  }

  // 1. 经典无损哈希映射，将书名每个字符映射为数字
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);

  // 2. 基础色相 (Hue): 0 ~ 360
  const h1 = absHash % 360;

  // 3. 互补色相 (Hue 2): 偏离 35 ~ 60 度，形成精巧的双色温浸润感，而绝不使用完全互补色 (防刺眼)
  const h2 = (h1 + 45) % 360;

  // 4. 饱和度 (Saturation): 控制在 15% ~ 32% 之间，营造高雅、静谧、宣纸柔光的低饱和漫反射效果
  const s1 = 15 + (absHash % 17); // 15% ~ 32%
  const s2 = 12 + ((absHash >> 3) % 15); // 12% ~ 27%

  // 5. 明度 (Lightness): 确保在 86% ~ 95% 之间极高亮，作大卡片漫反射背景极柔和、不刺眼、自适应护眼
  const l1 = 86 + ((absHash >> 6) % 8); // 86% ~ 94%
  const l2 = 88 + ((absHash >> 9) % 7); // 88% ~ 95%

  // 6. 边缘修饰与深色文本色温微调，保证其具备与主相一致的色温
  const textColor = `hsl(${h1}, ${s1 + 15}%, 22%)`;
  const borderColor = `hsl(${h1}, ${s1 + 5}%, 84%)`;
  const accentColor = `hsl(${h1}, ${s1 + 10}%, 38%)`;
  const muted = `hsl(${h1}, ${s1 + 8}%, 45%)`;

  const bgGradStart = `hsl(${h1}, ${s1}%, ${l1}%)`;
  const bgGradEnd = `hsl(${h2}, ${s2}%, ${l2}%)`;

  return {
    color1: bgGradStart,
    color2: bgGradEnd,
    textColor,
    borderColor,
    accentColor,
    bgGradStart,
    bgGradEnd,
    text: textColor,
    muted,
    border: borderColor,
    accent: accentColor
  };
}
