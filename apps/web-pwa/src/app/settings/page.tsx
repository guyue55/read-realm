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
import { AppHeader } from "@/components/AppHeader";
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

  const updateTheme = (theme: ThemeName) => {
    const nextSettings = { ...settings, theme };
    setSettings(nextSettings);
    saveReaderSettings(nextSettings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const currentTheme = THEMES[settings.theme];

  return (
    <div className="min-h-screen bg-[#F8F8F5] flex flex-col">
      <AppHeader
        title={strings.settings.title}
        onBack={() => router.push("/library")}
      />
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col items-center">
        <div className="w-full max-w-3xl">
          <p className="mt-2 mb-8 text-sm text-gray-600">
            {strings.settings.subtitle}
          </p>

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
                        ? "border-[#678055] ring-2 ring-[rgba(103,128,85,0.2)]"
                        : "border-[rgba(80,65,45,0.12)] hover:border-[#9A6A3A]"
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
              className="rounded-lg border border-[rgba(80,65,45,0.12)] p-6 shadow-sm"
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
    </div>
  );
}
