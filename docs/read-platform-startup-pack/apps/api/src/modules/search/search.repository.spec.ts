import { Test, TestingModule } from '@nestjs/testing';
import { SearchRepository } from './search.repository';
import { DRIZZLE } from '../database/database.module';

describe('SearchRepository', () => {
  let repository: SearchRepository;
  let db: any;

  beforeEach(async () => {
    db = {
      execute: jest.fn(),
      query: {
        books: {
          findMany: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchRepository,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    repository = module.get<SearchRepository>(SearchRepository);
  });

  it('should search books using MATCH', async () => {
    db.execute.mockResolvedValueOnce({
      rows: [{ id: '1' }],
    });
    db.query.books.findMany.mockResolvedValueOnce([{ id: '1', title: 'Test' }]);

    const result = await repository.searchBooks('Test');
    expect(db.execute).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test');
  });

  it('should return empty array if no query provided', async () => {
    const result = await repository.searchBooks('');
    expect(result).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('should return empty array if no results found', async () => {
    db.execute.mockResolvedValueOnce({
      rows: [],
    });

    const result = await repository.searchBooks('Nothing');
    expect(result).toEqual([]);
    expect(db.query.books.findMany).not.toHaveBeenCalled();
  });
});
