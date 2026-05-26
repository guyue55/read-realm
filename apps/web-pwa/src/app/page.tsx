"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Since we have a redirect in next.config.mjs, this page might not be reached directly
// However, if the redirect doesn't work locally or during client-side navigation, this will act as a fallback.
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/library");
  }, [router]);

  return null;
}
