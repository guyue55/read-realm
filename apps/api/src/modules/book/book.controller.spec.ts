import { Test, TestingModule } from '@nestjs/testing';
import { BookController } from './book.controller';
import { BookRepository } from './book.repository';
import { Book } from '@reader/shared-types';

describe('BookController', () => {
  let controller: BookController;
  let repository: BookRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookController],
      providers: [
        {
          provide: BookRepository,
          useValue: {
            importBook: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<BookController>(BookController);
    repository = module.get<BookRepository>(BookRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call importBook with correct parameters (expects "metadata")', async () => {
    const book: Book = {
      id: 'test-id',
      title: 'Test Book',
      sourceType: 'upload',
      format: 'epub',
      status: 'reading',
      tags: [],
      chapterCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const chapters = [
      {
        id: 'ch1',
        title: 'Chapter 1',
        index: 0,
        contentHash: 'hash',
        createdAt: new Date().toISOString(),
      },
    ];

    // Mocking the request from frontend as "metadata" instead of "book"
    await controller.importBook({ metadata: book, chapters });

    // This is expected to fail with current implementation because it expects "body.book"
    expect(repository.importBook).toHaveBeenCalledWith(book, chapters);
  });
});
