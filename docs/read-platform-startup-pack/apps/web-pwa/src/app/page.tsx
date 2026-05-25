'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@reader/storage-core/src/db';

export default function Home() {
  const [status, setStatus] = useState<string>('Ready');
  const [sortBy, setSortBy] = useState<'title' | 'createdAt'>('createdAt');

  const books = useLiveQuery(async () => {
    const allBooks = await db.books.toArray();
    return allBooks.sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sortBy]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus('Loading parser...');
      // Dynamic import to prevent build-time jsdom issues
      const { parseTxtBook, parseEpubBook } = await import('@reader/parser-core');

      setStatus('Reading file...');
      const buffer = await file.arrayBuffer();
      
      setStatus('Parsing file...');
      // Note: In real app, this should be in a Web Worker
      let parsedBook;
      if (file.name.toLowerCase().endsWith('.epub')) {
        parsedBook = await parseEpubBook(file.name, buffer);
      } else {
        parsedBook = parseTxtBook(file.name, buffer);
      }
      
      setStatus(`Parsed successfully! Chapters: ${parsedBook.chapters.length}`);
      
      // Save book metadata to Dexie
      const bookId = crypto.randomUUID();
      const format = file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt';
      await db.books.add({
        id: bookId,
        title: parsedBook.title,
        sourceType: 'upload',
        format,
        status: 'to_read',
        tags: [],
        chapterCount: parsedBook.chapters.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setStatus('Saving chapters...');
      const chaptersToSave = parsedBook.chapters.map((ch, index) => ({
        id: crypto.randomUUID(),
        bookId,
        index,
        title: ch.title,
        content: ch.content,
        wordCount: ch.content.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      await db.chapters.bulkAdd(chaptersToSave);
      
      setStatus('Syncing to cloud...');
      try {
        await fetch('http://localhost:3001/books/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            metadata: {
              id: bookId,
              title: parsedBook.title,
              sourceType: 'upload',
              format,
              status: 'to_read',
              tags: [],
              chapterCount: parsedBook.chapters.length,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, 
            chapters: chaptersToSave 
          })
        });
      } catch (e) {
        console.error('Backend sync failed', e);
      }

      setStatus(`Saved "${parsedBook.title}" to local library!`);
      
    } catch (e) {
      const error = e as Error;
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (bookId: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;

    try {
      setStatus(`Deleting "${title}"...`);
      
      // 1. Delete local Dexie data
      await db.transaction('rw', [db.books, db.chapters, db.progress, db.bookmarks], async () => {
        await db.chapters.where('bookId').equals(bookId).delete();
        await db.progress.where('bookId').equals(bookId).delete();
        await db.bookmarks.where('bookId').equals(bookId).delete();
        await db.books.delete(bookId);
      });

      // 2. Call backend DELETE API
      try {
        await fetch(`http://localhost:3001/books/${bookId}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.error('Backend delete failed', e);
      }

      setStatus(`Deleted "${title}" successfully.`);
    } catch (e) {
      const error = e as Error;
      setStatus(`Delete error: ${error.message}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-[#F8F8F5] text-[#2F2A24]">
      <h1 className="text-3xl font-bold mb-8">My Reading World</h1>
      
      {/* Upload Section */}
      <div className="mb-12 w-full max-w-2xl border-2 border-dashed border-[#3A2D22] p-8 rounded-lg bg-white shadow-sm">
        <p className="mb-4 text-center font-semibold">Import Local Book (.txt, .epub)</p>
        <input 
          type="file" 
          accept=".txt,.epub" 
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E8E3DA] file:text-[#2D2A26] hover:file:bg-[#DDEBD6] transition-colors"
        />
        <p className="mt-4 text-center font-mono text-xs text-gray-500">{status}</p>
      </div>

      {/* Library Section */}
      <div className="w-full max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Local Library ({books?.length || 0})</h2>
          <div className="flex gap-2 text-sm">
            <span className="text-gray-500 py-1">Sort by:</span>
            <button 
              onClick={() => setSortBy('title')}
              className={`px-3 py-1 rounded-full border ${sortBy === 'title' ? 'bg-[#3A2D22] text-white' : 'bg-white text-[#3A2D22] border-[#3A2D22]'}`}
            >
              Title
            </button>
            <button 
              onClick={() => setSortBy('createdAt')}
              className={`px-3 py-1 rounded-full border ${sortBy === 'createdAt' ? 'bg-[#3A2D22] text-white' : 'bg-white text-[#3A2D22] border-[#3A2D22]'}`}
            >
              Recent
            </button>
          </div>
        </div>

        {books && books.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book) => (
              <div key={book.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <h3 className="font-bold text-lg mb-2 line-clamp-2">{book.title}</h3>
                  <div className="flex gap-2 mb-4">
                    <span className="text-xs px-2 py-0.5 bg-[#E8E3DA] rounded uppercase">{book.format}</span>
                    <span className="text-xs text-gray-500">{book.chapterCount} chapters</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => window.location.href = `/reader/${book.id}`}
                    className="flex-1 bg-[#DDEBD6] text-[#2D2A26] py-2 rounded font-semibold hover:bg-[#CFE2C5] transition-colors"
                  >
                    Read
                  </button>
                  <button 
                    onClick={() => handleDelete(book.id, book.title)}
                    className="px-3 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    title="Delete Book"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-lg border border-gray-200 text-gray-400">
            Your library is empty. Upload a book to get started!
          </div>
        )}
      </div>
    </main>
  );
}
