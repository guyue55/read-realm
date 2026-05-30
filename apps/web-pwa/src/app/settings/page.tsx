"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_READER_SETTINGS,
  loadReaderSettings,
  saveReaderSettings,
  type ReaderSettingsState,
} from "@/lib/reader-settings";
import { THEMES, type ThemeName } from "@/styles/themes";
import { strings } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<ReaderSettingsState>(
    DEFAULT_READER_SETTINGS,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadReaderSettings());
  }, []);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const saveNextSettings = (nextSettings: ReaderSettingsState) => {
    setSettings(nextSettings);
    saveReaderSettings(nextSettings);
    setSaved(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setSaved(false);
    }, 1200);
  };

  // 拖动期间仅更新 React State，变动 CSS 变量触发预览重绘，无任何 IO 与定时器开销，保障 60fps 流畅度
  const handleSettingChange = (nextSettings: ReaderSettingsState) => {
    setSettings(nextSettings);
  };

  // 拖动结束/松开时执行写盘，并单次优雅触发保存气泡
  const handleSettingCommit = (nextSettings: ReaderSettingsState) => {
    saveReaderSettings(nextSettings);
    setSaved(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setSaved(false);
    }, 1200);
  };

  const updateTheme = (theme: ThemeName) => {
    saveNextSettings({ ...settings, theme });
  };

  const updateUiMode = (uiMode: "default" | "simple") => {
    saveNextSettings({ ...settings, uiMode });
  };

  const handleReset = () => {
    if (confirm("确定要恢复默认排版设置吗？")) {
      saveNextSettings(DEFAULT_READER_SETTINGS);
    }
  };

  const currentTheme = THEMES[settings.theme];

  return (
    <AppShell
      title="设置"
      subtitle="案前雅度，因人而适。在这里微调行间章合，雕刻最契合您双眸的心流世界。"
      rightNodes={
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-all hover:bg-white hover:text-[var(--ui-accent)] flex items-center gap-1.5 shadow-sm active:scale-95 duration-200"
          >
            <span>⚙</span> 重置默认
          </button>
          <button
            onClick={() => router.push("/library")}
            className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white shadow-sm"
          >
            返回书架
          </button>
        </div>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">UI 模式</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                默认模式贴近原型套图，简洁模式保留无干扰布局。
              </p>
            </div>
            {saved && (
              <span className="rounded-full bg-[var(--ui-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--ui-accent)]">
                {strings.settings.saved}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => updateUiMode("default")}
              className={`ui-focus-ring rounded-[16px] border p-5 text-left transition-all ${
                settings.uiMode === "default"
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] ring-2 ring-[rgba(95,125,82,0.16)]"
                  : "border-[var(--ui-border)] bg-white/64 hover:border-[var(--ui-warm)]"
              }`}
            >
              <span className="block text-base font-bold text-[var(--ui-text)]">
                默认模式
              </span>
              <span className="mt-1 block text-sm text-[var(--ui-muted)]">
                更完整的原型视觉、侧边导航和信息卡片。
              </span>
            </button>
            <button
              onClick={() => updateUiMode("simple")}
              className={`ui-focus-ring rounded-[16px] border p-5 text-left transition-all ${
                settings.uiMode === "simple"
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] ring-2 ring-[rgba(95,125,82,0.16)]"
                  : "border-[var(--ui-border)] bg-white/64 hover:border-[var(--ui-warm)]"
              }`}
            >
              <span className="block text-base font-bold text-[var(--ui-text)]">
                简洁模式
              </span>
              <span className="mt-1 block text-sm text-[var(--ui-muted)]">
                保留轻量书架与极简阅读布局。
              </span>
            </button>
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{strings.settings.theme}</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                {strings.settings.themeHint}
              </p>
            </div>
            {saved && (
              <span className="rounded-full bg-[var(--ui-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--ui-accent)]">
                {strings.settings.saved}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(THEMES).map(([name, colors]) => {
              const themeName = name as ThemeName;
              const isActive = settings.theme === themeName;

              return (
                <button
                  key={name}
                  onClick={() => updateTheme(themeName)}
                  className={`ui-focus-ring flex min-h-24 flex-col justify-between rounded-[14px] border p-3 text-left shadow-sm transition-all hover:scale-[1.03] active:scale-95 ${
                    isActive
                      ? "border-[var(--ui-accent)] ring-2 ring-[rgba(95,125,82,0.18)]"
                      : "border-[rgba(80,65,45,0.12)] hover:border-[var(--ui-warm)]"
                  }`}
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  <span className="text-sm font-bold">
                    {strings.reader.themeNames[themeName]}
                  </span>
                  <span
                    className="h-6 w-6 rounded-full border"
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: colors.text,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">字体风雅</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                选择适合当前书卷意境的印刷字体。系统默认使用优雅护眼的国风楷体。
              </p>
            </div>
            {saved && (
              <span className="rounded-full bg-[var(--ui-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--ui-accent)]">
                {strings.settings.saved}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                key: "kaiti",
                name: "楷体 (Kaiti)",
                desc: "笔锋流丽，宣纸生香。最契合古典宁静的心流之选。",
              },
              {
                key: "songti",
                name: "宋体 (Songti)",
                desc: "版刻雕木，庄重隽永。提供长篇巨著的纸质印刷级体验。",
              },
              {
                key: "heiti",
                name: "黑体 (Heiti)",
                desc: "规整锐利，数智清朗。清晰流畅的现代化屏显标准。",
              },
            ].map((f) => {
              const isActive = settings.fontFamily === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() =>
                    saveNextSettings({
                      ...settings,
                      fontFamily: f.key as "kaiti" | "songti" | "heiti",
                    })
                  }
                  className={`ui-focus-ring flex flex-col justify-between rounded-[16px] border p-4 text-left transition-all hover:scale-[1.02] active:scale-95 duration-200 ${
                    isActive
                      ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] ring-2 ring-[rgba(95,125,82,0.16)]"
                      : "border-[var(--ui-border)] bg-white/64 hover:border-[var(--ui-warm)]"
                  }`}
                >
                  <span
                    className="block text-base font-bold text-[var(--ui-text)]"
                    style={{ fontFamily: `var(--font-${f.key})` }}
                  >
                    {f.name}
                  </span>
                  <span className="mt-2 block text-xs text-[var(--ui-muted)] leading-relaxed">
                    {f.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 space-y-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div>
            <h2 className="text-lg font-bold">排版微调</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              自由解耦四大印刷维度的微秒级形变，调节最适合您的中文宁静排版黄金比例。
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* 字号滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">字号 (Size)</span>
                <span className="text-[var(--ui-accent)]">{settings.fontSize} px</span>
              </div>
              <input
                type="range"
                min="14"
                max="36"
                step="1"
                value={settings.fontSize}
                onChange={(e) => handleSettingChange({ ...settings, fontSize: parseInt(e.target.value) })}
                onMouseUp={() => handleSettingCommit(settings)}
                onTouchEnd={() => handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>小号 (14px)</span>
                <span>大号 (36px)</span>
              </div>
            </div>

            {/* 行高滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">行高 (Line Height)</span>
                <span className="text-[var(--ui-accent)]">{settings.lineHeight} 倍</span>
              </div>
              <input
                type="range"
                min="1.3"
                max="2.4"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => handleSettingChange({ ...settings, lineHeight: parseFloat(e.target.value) })}
                onMouseUp={() => handleSettingCommit(settings)}
                onTouchEnd={() => handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>紧凑 (1.3)</span>
                <span>宽松 (2.4)</span>
              </div>
            </div>

            {/* 段距滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">段落间距 (Paragraph)</span>
                <span className="text-[var(--ui-accent)]">{settings.paragraphSpacing} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="2"
                value={settings.paragraphSpacing}
                onChange={(e) => handleSettingChange({ ...settings, paragraphSpacing: parseInt(e.target.value) })}
                onMouseUp={() => handleSettingCommit(settings)}
                onTouchEnd={() => handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>紧密 (0px)</span>
                <span>开阔 (40px)</span>
              </div>
            </div>

            {/* 字距滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">字符间距 (Letter)</span>
                <span className="text-[var(--ui-accent)]">{settings.letterSpacing} em</span>
              </div>
              <input
                type="range"
                min="-0.05"
                max="0.25"
                step="0.01"
                value={settings.letterSpacing}
                onChange={(e) => handleSettingChange({ ...settings, letterSpacing: parseFloat(e.target.value) })}
                onMouseUp={() => handleSettingCommit(settings)}
                onTouchEnd={() => handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>紧密 (-0.05em)</span>
                <span>开阔 (0.25em)</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <h2 className="mb-4 text-lg font-bold">
            {strings.settings.previewTitle}
          </h2>
          <div
            className="rounded-[16px] border border-[rgba(80,65,45,0.12)] p-6 shadow-sm transition-all duration-300"
            style={{
              backgroundColor: currentTheme.bg,
              color: currentTheme.text,
            }}
          >
            <h3 className="font-reading-title mb-4 text-2xl font-semibold" style={{ letterSpacing: `${settings.letterSpacing}em` }}>
              黄金排版案头预览
            </h3>
            <div
              className="reader-content"
              style={{
                "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                "--paragraph-spacing": `${settings.paragraphSpacing}px`,
                "--letter-spacing": `${settings.letterSpacing}em`,
              } as React.CSSProperties}
            >
              <p>
                一页安静的文字，应该像灯下摊开的纸，字与字有了呼吸的空隙，段与段有了落脚的宁静。
              </p>
              <p>
                这是「墨问」为您呈现的全新中式排版微调。行距起承、段距转合、字距呼吸皆在指尖流淌，在最细微的间隙里，雕刻出您最舒适的宁静世界。
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
