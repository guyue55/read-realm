'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@reader/storage-core';
import type { Book } from '@reader/shared-types';
import { apiUrl } from '@/lib/api';
import { strings } from '@/lib/i18n';

export default function Home() {
  const [status, setStatus] = useState<string>('Ready');
  const [sortBy, setSortBy] = useState<'title' | 'createdAt'>('createdAt');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [globalResults, setGlobalResults] = useState<Book[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);

  const books = useLiveQuery(async () => {
    const allBooks = await db.books.toArray();
    
    let filtered = allBooks;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = allBooks.filter(b => 
        b.title.toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sortBy, searchQuery]);

  const handleGlobalSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsGlobalSearching(true);
    setStatus(strings.shelf.searchingGlobal);
    try {
      const response = await fetch(apiUrl(`/search?q=${encodeURIComponent(searchQuery)}`));
      if (!response.ok) throw new Error('Search failed');
      const results = await response.json();
      setGlobalResults(results);
      setStatus(strings.shelf.foundResults.replace('{count}', results.length.toString()));
    } catch (e) {
      console.error('Global search failed', e);
      setStatus(strings.shelf.searchFailed);
    } finally {
      setIsGlobalSearching(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus(strings.shelf.loadingParser);
      // Dynamic import to prevent build-time jsdom issues
      const { parseTxtBook, parseEpubBook } = await import('@reader/parser-core');

      setStatus(strings.shelf.readingFile);
      const buffer = await file.arrayBuffer();
      
      setStatus(strings.shelf.parsingFile);
      // Note: In real app, this should be in a Web Worker
      let parsedBook;
      if (file.name.toLowerCase().endsWith('.epub')) {
        parsedBook = await parseEpubBook(file.name, buffer);
      } else {
        parsedBook = parseTxtBook(file.name, buffer);
      }
      
      setStatus(strings.shelf.parseSuccess.replace('{count}', parsedBook.chapters.length.toString()));
      
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

      setStatus(strings.shelf.savingChapters);
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
      
      setStatus(strings.shelf.syncingCloud);
      try {
        await fetch(apiUrl('/books/import'), {
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

      setStatus(strings.shelf.saveSuccess.replace('{title}', parsedBook.title));
      
    } catch (e) {
      const error = e as Error;
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (bookId: string, title: string) => {
    if (!confirm(strings.shelf.deleteConfirm.replace('{title}', title))) return;

    try {
      setStatus(strings.shelf.deleting.replace('{title}', title));
      
      // 1. Delete local Dexie data
      await db.transaction('rw', [db.books, db.chapters, db.progress, db.bookmarks], async () => {
        await db.chapters.where('bookId').equals(bookId).delete();
        await db.progress.where('bookId').equals(bookId).delete();
        await db.bookmarks.where('bookId').equals(bookId).delete();
        await db.books.delete(bookId);
      });

      // 2. Call backend DELETE API
      try {
        await fetch(apiUrl(`/books/${bookId}`), {
          method: 'DELETE',
        });
      } catch (e) {
        console.error('Backend delete failed', e);
      }

      setStatus(strings.shelf.deleteSuccess.replace('{title}', title));
    } catch (e) {
      const error = e as Error;
      setStatus(`Delete error: ${error.message}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-[#F8F8F5] text-[#2F2A24]">
      <h1 className="text-3xl font-bold mb-8">{strings.shelf.title}</h1>
      
      {/* Upload Section */}
      <div className="mb-12 w-full max-w-2xl border-2 border-dashed border-[#3A2D22] p-8 rounded-lg bg-white shadow-sm">
        <p className="mb-4 text-center font-semibold">{strings.shelf.importTitle}</p>
        <input 
          type="file" 
          accept=".txt,.epub" 
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E8E3DA] file:text-[#2D2A26] hover:file:bg-[#DDEBD6] transition-colors"
        />
        <p className="mt-4 text-center font-mono text-xs text-gray-500">{status}</p>
      </div>

      {/* Search Bar */}
      <div className="w-full max-w-4xl mb-8 flex gap-2">
        <div className="relative flex-1">
          <input 
            type="text"
            placeholder={strings.shelf.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3A2D22] bg-white shadow-sm"
          />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setGlobalResults([]);
              }}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
        <button 
          onClick={handleGlobalSearch}
          disabled={isGlobalSearching}
          className="px-6 py-2 bg-[#3A2D22] text-white rounded-lg font-semibold hover:bg-[#2A1F18] transition-colors disabled:bg-gray-400 shadow-sm"
        >
          {isGlobalSearching ? strings.shelf.searchingGlobal : strings.shelf.globalSearch}
        </button>
      </div>

      {/* Library Section */}
      <div className="w-full max-w-4xl">
        {/* Local Results */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{strings.shelf.libraryTitle} ({books?.length || 0})</h2>
          <div className="flex gap-2 text-sm">
            <span className="text-gray-500 py-1">{strings.shelf.sortBy}</span>
            <button 
              onClick={() => setSortBy('title')}
              className={`px-3 py-1 rounded-full border ${sortBy === 'title' ? 'bg-[#3A2D22] text-white' : 'bg-white text-[#3A2D22] border-[#3A2D22]'}`}
            >
              {strings.shelf.sortTitle}
            </button>
            <button 
              onClick={() => setSortBy('createdAt')}
              className={`px-3 py-1 rounded-full border ${sortBy === 'createdAt' ? 'bg-[#3A2D22] text-white' : 'bg-white text-[#3A2D22] border-[#3A2D22]'}`}
            >
              {strings.shelf.sortRecent}
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
                    <span className="text-xs text-gray-500">{strings.reader.chapterCount.replace('{count}', book.chapterCount.toString())}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => window.location.href = `/reader/${book.id}`}
                    className="flex-1 bg-[#DDEBD6] text-[#2D2A26] py-2 rounded font-semibold hover:bg-[#CFE2C5] transition-colors"
                  >
                    {strings.shelf.read}
                  </button>
                  <button 
                    onClick={() => handleDelete(book.id, book.title)}
                    className="px-3 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    title={strings.shelf.delete}
                  >
                    {strings.shelf.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-lg border border-gray-200 text-gray-400">
            {searchQuery ? strings.shelf.noMatches : strings.shelf.emptyLibrary}
          </div>
        )}

        {/* Global Results Section */}
        {(() => {
          const localBookIds = new Set(books?.map(b => b.id) || []);
          const uniqueGlobalResults = globalResults.filter(b => !localBookIds.has(b.id));
          
          if (uniqueGlobalResults.length === 0) return null;

          return (
            <div className="mt-12 mb-8">
              <h2 className="text-xl font-bold mb-6 text-gray-600 border-t pt-8">{strings.shelf.globalResultsTitle} ({uniqueGlobalResults.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {uniqueGlobalResults.map((book) => (
                  <div key={book.id} className="bg-white p-6 rounded-lg shadow-sm border border-dashed border-gray-300 flex flex-col justify-between opacity-80 hover:opacity-100 transition-opacity">
                    <div>
                      <h3 className="font-bold text-lg mb-2 line-clamp-2">{book.title}</h3>
                      <div className="flex gap-2 mb-4">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded uppercase text-gray-500">{strings.shelf.notInLibrary}</span>
                        <span className="text-xs text-gray-500">{book.format}</span>
                      </div>
                    </div>
                    <button 
                      disabled
                      className="w-full bg-gray-100 text-gray-400 py-2 rounded font-semibold cursor-not-allowed"
                    >
                      {strings.shelf.foundInCloud}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
