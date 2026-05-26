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

export default function SettingsPage() {
  const [settings, setSettings] = useState<ReaderSettingsState>(
    DEFAULT_READER_SETTINGS,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadReaderSettings());
  }, []);

  const updateTheme = (theme: ThemeName) => {
    const nextSettings = { ...settings, theme };
    setSettings(nextSettings);
    saveReaderSettings(nextSettings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const currentTheme = THEMES[settings.theme];

  return (
    <main className="min-h-screen bg-[#F8F8F5] px-5 py-8 text-[#2F2A24] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{strings.settings.title}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {strings.settings.subtitle}
            </p>
          </div>
          <button
            onClick={() => (window.location.href = "/")}
            className="shrink-0 rounded-lg border border-[#3A2D22] bg-white px-4 py-2 text-sm font-semibold text-[#3A2D22] shadow-sm transition-colors hover:bg-[#E8E3DA]"
          >
            {strings.settings.backToShelf}
          </button>
        </div>

        <section className="border-t border-[#DDD6C8] py-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{strings.settings.theme}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {strings.settings.themeHint}
              </p>
            </div>
            {saved && (
              <span className="text-sm font-semibold text-green-700">
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
                  className={`flex min-h-24 flex-col justify-between rounded-lg border p-3 text-left shadow-sm transition-all ${
                    isActive
                      ? "border-blue-600 ring-2 ring-blue-100"
                      : "border-gray-200 hover:border-gray-400"
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

        <section className="border-t border-[#DDD6C8] py-6">
          <h2 className="mb-4 text-lg font-bold">
            {strings.settings.previewTitle}
          </h2>
          <div
            className="rounded-lg border border-black/10 p-6 shadow-sm"
            style={{ backgroundColor: currentTheme.bg, color: currentTheme.text }}
          >
            <h3 className="mb-4 text-xl font-bold">
              {strings.settings.previewTitle}
            </h3>
            <p className="text-lg leading-[1.7]">
              {strings.settings.previewText}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
