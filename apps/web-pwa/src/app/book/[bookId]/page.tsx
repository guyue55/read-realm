import BookDetailClient from "./BookDetailClient";

export function generateStaticParams() {
  // 返回占位参数以使 Next.js 在 EXPORT_MODE 静态导出编译时能顺利渲染占位文件并顺利编译通过
  return [{ bookId: "placeholder" }];
}

export default function Page({ params }: { params: { bookId: string } }) {
  return <BookDetailClient params={params} />;
}
