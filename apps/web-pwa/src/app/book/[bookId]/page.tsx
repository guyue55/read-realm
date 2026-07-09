import BookDetailClient from "./BookDetailClient";

type BookPageProps = {
  params: Promise<{ bookId: string }>;
};

export function generateStaticParams() {
  // 返回占位参数以使 Next.js 在 EXPORT_MODE 静态导出编译时能顺利渲染占位文件并顺利编译通过
  return [{ bookId: "placeholder" }];
}

export default async function Page({ params }: BookPageProps) {
  const resolvedParams = await params;
  return <BookDetailClient params={resolvedParams} />;
}
