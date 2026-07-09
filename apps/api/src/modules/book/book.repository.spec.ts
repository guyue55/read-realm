/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { BookRepository } from './book.repository';
import { DRIZZLE } from '../database/database.module';
import { Book } from '@reader/shared-types';
import * as schema from '../database/schema';

describe('BookRepository', () => {
  let repository: BookRepository;
  let db: any;

  beforeEach(async () => {
    db = {
      transaction: jest.fn(async (cb) => {
        const tx = {
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(undefined),
        };
        return await cb(tx);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookRepository,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    repository = module.get<BookRepository>(BookRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should import book and chapters with correct linking', async () => {
    const book: Book = {
      id: 'book-1',
      title: 'Test Book',
      sourceType: 'upload',
      format: 'epub',
      status: 'reading',
      tags: ['tag1'],
      chapterCount: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const chapters = [
      {
        id: 'ch-1',
        title: 'Chapter 1',
        index: 0,
        content: 'hello',
      },
    ];

    let capturedTx: any;
    db.transaction.mockImplementationOnce(async (cb: any) => {
      capturedTx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };
      await cb(capturedTx);
    });

    await repository.importBook(book, chapters);

    // Verify book insertion (tags omitted)
    expect(capturedTx.insert).toHaveBeenCalledWith(schema.books);
    expect(capturedTx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'book-1',
        title: 'Test Book',
      }),
    );
    expect(capturedTx.values).not.toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.anything(),
      }),
    );

    // Verify chapters insertion with bookId set
    expect(capturedTx.insert).toHaveBeenCalledWith(schema.chapters);
    expect(capturedTx.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ch-1',
          bookId: 'book-1',
          contentHash:
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        }),
      ]),
    );
  });

  it('should ignore imported contentHash and derive blob key from content', async () => {
    const book: Book = {
      id: 'book-1',
      title: 'Test Book',
      sourceType: 'upload',
      format: 'txt',
      status: 'reading',
      tags: [],
      chapterCount: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const blobStorage = {
      putObject: jest.fn().mockResolvedValue(undefined),
    };
    (repository as any).blobStorage = blobStorage;

    await repository.importBook(
      book,
      [
        {
          id: 'ch-1',
          title: 'Chapter 1',
          index: 0,
          content: 'safe-content',
          contentHash: '../../outside',
        } as any,
      ],
      'default',
    );

    expect(blobStorage.putObject).toHaveBeenCalledWith(
      '63a2f0f94f2efe262dee71613926b2bb5ceda47b0aa2950d9403dcfd5a089ec8',
      'safe-content',
    );
  });

  it('should upsert book metadata before appending chapter chunks', async () => {
    const book: Book = {
      id: 'book-1',
      title: 'Chunked Book',
      sourceType: 'upload',
      format: 'txt',
      status: 'reading',
      tags: [],
      chapterCount: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);

    let capturedTx: any;
    db.transaction.mockImplementationOnce(async (cb: any) => {
      capturedTx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        onConflictDoUpdate,
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };
      await cb(capturedTx);
    });

    await repository.importBook(
      book,
      [
        {
          id: 'ch-1',
          title: 'Chapter 1',
          index: 0,
          content: 'hello',
        },
      ],
      'default',
      { replaceExisting: false },
    );

    expect(capturedTx.insert).toHaveBeenCalledWith(schema.books);
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: schema.books.id,
      set: expect.objectContaining({
        id: 'book-1',
        title: 'Chunked Book',
      }),
    });
  });
});
