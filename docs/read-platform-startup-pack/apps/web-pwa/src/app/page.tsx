import { AppErrorCode } from '@reader/shared-types';

export default function Home() {
  const code: AppErrorCode = 'NETWORK_OFFLINE';
  
  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-[#F8F8F5] text-[#2F2A24]">
      <h1 className="text-2xl font-bold">Novel Reader Platform</h1>
      <p className="mt-4">Test Status Code: {code}</p>
    </main>
  );
}
