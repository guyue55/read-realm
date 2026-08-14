/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { SearchRepository } from './search.repository';
import { DRIZZLE } from '../database/database.module';

describe('SearchRepository', () => {
  let repository: SearchRepository;
  let db: any;

  beforeEach(async () => {
    db = {
      all: jest.fn(),
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

  it('should search books using MATCH for default library scope', async () => {
    db.all.mockResolvedValueOnce([{ id: '1' }]);
    db.query.books.findMany.mockResolvedValueOnce([{ id: '1', title: 'Test' }]);

    const result = await repository.searchBooks('Test');
    expect(db.all).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test');
  });

  it('should return empty array if no query provided', async () => {
    const result = await repository.searchBooks('');
    expect(result).toEqual([]);
    expect(db.all).not.toHaveBeenCalled();
  });

  it('should return empty array if no results found', async () => {
    db.all.mockResolvedValueOnce([]);

    const result = await repository.searchBooks('Nothing');
    expect(result).toEqual([]);
    expect(db.query.books.findMany).not.toHaveBeenCalled();
  });

  it('should only return books for the requested share token', async () => {
    db.all.mockResolvedValueOnce([
      { id: '1' },
      { id: '2#friend' },
      { id: '3#other' },
    ]);
    db.query.books.findMany.mockResolvedValueOnce([
      { id: '2#friend', title: 'Shared' },
    ]);

    const result = await repository.searchBooks('Shared', 'friend');

    expect(result).toEqual([{ id: '2', title: 'Shared', tags: [] }]);
  });

  it('bounds a private scope to a stable first 200 results before loading details', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({
      id: `${String(index).padStart(3, '0')}#friend`,
    }));
    db.all.mockResolvedValueOnce(rows);
    db.query.books.findMany.mockImplementationOnce(
      ({ where }: { where: unknown }) => {
        void where;
        return Promise.resolve(
          rows.slice(0, 200).map(({ id }) => ({ id, title: id })),
        );
      },
    );

    const result = await repository.searchBooks('共同词', 'friend');

    expect(result).toHaveLength(200);
    expect(result[0]?.id).toBe('000');
    expect(result[199]?.id).toBe('199');
    const query = JSON.stringify(db.all.mock.calls[0]?.[0]);
    expect(query).toContain('ORDER BY rank, id');
    expect(query).toContain('LIMIT');
    expect(query).toContain('200');
  });
});
