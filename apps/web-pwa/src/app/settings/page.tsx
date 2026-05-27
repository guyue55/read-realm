"use client";

import { useEffect, useState } from "react";
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

  const saveNextSettings = (nextSettings: ReaderSettingsState) => {
    setSettings(nextSettings);
    saveReaderSettings(nextSettings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const updateTheme = (theme: ThemeName) => {
    saveNextSettings({ ...settings, theme });
  };

  const updateUiMode = (uiMode: "default" | "simple") => {
    saveNextSettings({ ...settings, uiMode });
  };

  const currentTheme = THEMES[settings.theme];

  return (
    <AppShell
      title="设置"
      subtitle="阅读偏好、主题、存储与同步"
      rightNodes={
        <button
          onClick={() => router.push("/library")}
          className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white"
        >
          返回书架
        </button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="ui-card h-fit rounded-[16px] p-2">
          {["阅读偏好", "主题与字体", "存储管理", "设备同步", "隐私与权限"].map(
            (item, index) => (
              <button
                key={item}
                className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  index === 1
                    ? "bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]"
                    : "text-[var(--ui-muted)] hover:bg-white/70 hover:text-[var(--ui-text)]"
                }`}
              >
                {item}
              </button>
            ),
          )}
        </aside>

        <div className="space-y-5">
          <section className="ui-card rounded-[18px] p-5 md:p-6">
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

          <section className="ui-card rounded-[18px] p-5 md:p-6">
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
                    className={`ui-focus-ring flex min-h-24 flex-col justify-between rounded-[14px] border p-3 text-left shadow-sm transition-all ${
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

          <section className="ui-card rounded-[18px] p-5 md:p-6">
            <h2 className="mb-4 text-lg font-bold">
              {strings.settings.previewTitle}
            </h2>
            <div
              className="rounded-[16px] border border-[rgba(80,65,45,0.12)] p-6 shadow-sm"
              style={{
                backgroundColor: currentTheme.bg,
                color: currentTheme.text,
              }}
            >
              <h3 className="font-reading-title mb-4 text-2xl font-semibold">
                {strings.settings.previewTitle}
              </h3>
              <p className="text-lg leading-[1.7]">
                {strings.settings.previewText}
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="ui-card rounded-[18px] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">存储管理</h2>
                <span className="text-xs font-semibold text-[var(--ui-accent)]">
                  正常
                </span>
              </div>
              <p className="text-sm text-[var(--ui-muted)]">
                本地缓存 2.40 GB / 10 GB
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(80,65,45,0.08)]">
                <div className="h-full w-1/4 rounded-full bg-[var(--ui-accent)]" />
              </div>
            </div>

            <div className="ui-card rounded-[18px] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">设备同步</h2>
                <span className="text-xs text-[var(--ui-muted)]">刚刚</span>
              </div>
              <div className="space-y-3 text-sm text-[var(--ui-muted)]">
                <div className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2">
                  <span>MacBook Pro</span>
                  <span className="text-[var(--ui-accent)]">当前设备</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2">
                  <span>iPhone</span>
                  <span>3 分钟前</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
