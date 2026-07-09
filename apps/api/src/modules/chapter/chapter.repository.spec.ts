/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ChapterRepository } from './chapter.repository';
import { DRIZZLE } from '../database/database.module';

/**
 * Drizzle 的条件树是带循环引用的对象树，直接 JSON.stringify 会抛 TypeError。
 * 这里只关心条件里出现的「字符串字面量」，所以做一个浅遍历把字符串值收集起来即可。
 */
function collectStringLiterals(
  node: unknown,
  sink: Set<string>,
  seen = new WeakSet(),
) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    sink.add(node);
    return;
  }
  if (typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectStringLiterals(value, sink, seen);
  }
}

describe('ChapterRepository (shareToken 物理隔离)', () => {
  let repository: ChapterRepository;
  let db: any;
  let lastWhereArg: any;

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: (clause: any) => {
            lastWhereArg = clause;
            return {
              limit: jest.fn().mockResolvedValue([]),
              then: (cb: any) => cb([]),
            };
          },
        }),
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ChapterRepository, { provide: DRIZZLE, useValue: db }],
    }).compile();

    repository = moduleRef.get(ChapterRepository);
  });

  it('default token 时章节查询条件兼容历史 bookId 形态', async () => {
    await repository.findByIndex('book-1', 0, 'default');
    const literals = new Set<string>();
    collectStringLiterals(lastWhereArg, literals);
    expect(literals.has('book-1#default')).toBe(true);
    expect(literals.has('book-1')).toBe(true);
  });

  it('自定义 token 时章节查询只匹配该 token 后缀，避免越权读到默认书架', async () => {
    await repository.findByIndex('book-1', 0, 'studio-share');
    const literals = new Set<string>();
    collectStringLiterals(lastWhereArg, literals);
    expect(literals.has('book-1#studio-share')).toBe(true);
    expect(literals.has('book-1#default')).toBe(false);
    expect(literals.has('book-1')).toBe(false);
  });
});
