import PreviewClient from "./PreviewClient";

type PreviewPageProps = {
  params: Promise<{ taskId: string }>;
};

export function generateStaticParams() {
  // 返回占位参数以使 Next.js 在 EXPORT_MODE 静态导出编译时能顺利渲染占位文件并顺利编译通过
  return [{ taskId: "placeholder" }];
}

export default async function Page({ params }: PreviewPageProps) {
  const resolvedParams = await params;
  return <PreviewClient params={resolvedParams} />;
}
