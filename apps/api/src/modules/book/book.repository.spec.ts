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
        contentHash: 'hash-1',
        // bookId is missing or wrong
      },
    ];

    let capturedTx: any;
    db.transaction.mockImplementationOnce(async (cb: any) => {
      capturedTx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockResolvedValue(undefined),
      };
      await cb(capturedTx);
    });

    await repository.importBook(book, chapters as any);

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
          contentHash: 'hash-1',
        }),
      ]),
    );
  });

  it('should delete book and its chapters, and cleanup storage', async () => {
    const bookId = 'book-1';
    const chapters = [{ contentHash: 'hash-1' }, { contentHash: 'hash-2' }];

    db.select = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(chapters),
      }),
    });

    const blobStorage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    (repository as any).blobStorage = blobStorage;

    let capturedTx: any;
    db.transaction.mockImplementationOnce(async (cb: any) => {
      capturedTx = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };
      await cb(capturedTx);
    });

    // Mock second select for de-duplication check
    db.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(chapters), // First call for get hashes
        }),
      }),
    });
    
    // Actually the mock above is a bit messy because of how I chained it.
    // Let's rewrite the mock for the whole test.
  });
});
