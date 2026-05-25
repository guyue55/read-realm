'use client';

import { useState } from 'react';
import { db } from '@reader/storage-core';
import { parseTxtBook } from '@reader/parser-core';

export default function Home() {
  const [status, setStatus] = useState<string>('Ready');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus('Reading file...');
      const buffer = await file.arrayBuffer();
      
      setStatus('Parsing TXT...');
      // Note: In real app, this should be in a Web Worker
      const parsedBook = parseTxtBook(file.name, buffer);
      
      setStatus(`Parsed successfully! Chapters: ${parsedBook.chapters.length}`);
      
      // Save book metadata to Dexie
      await db.books.add({
        id: crypto.randomUUID(),
        title: parsedBook.title,
        sourceType: 'upload',
        format: 'txt',
        status: 'to_read',
        tags: [],
        chapterCount: parsedBook.chapters.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      setStatus(`Saved "${parsedBook.title}" to local library!`);
      
    } catch (e) {
      const error = e as Error;
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-[#F8F8F5] text-[#2F2A24]">
      <h1 className="text-2xl font-bold">Novel Reader Platform - Local Shelf</h1>
      
      <div className="mt-8 border-2 border-dashed border-[#3A2D22] p-8 rounded-lg">
        <p className="mb-4 text-center">Import Local Book</p>
        <input 
          type="file" 
          accept=".txt" 
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E8E3DA] file:text-[#2D2A26] hover:file:bg-[#DDEBD6]"
        />
      </div>

      <p className="mt-4 font-mono">{status}</p>
    </main>
  );
}
