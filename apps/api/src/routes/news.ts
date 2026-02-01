import { Hono } from 'hono';
import { db, news } from '@wallstreetsim/db';
import { desc, eq, like } from 'drizzle-orm';
import { PaginationSchema } from '@wallstreetsim/utils';

const newsRouter = new Hono();

/**
 * GET /news - Get news feed
 */
newsRouter.get('/', async (c) => {
  const query = c.req.query();
  const pagination = PaginationSchema.safeParse(query);
  const category = query.category;
  const symbol = query.symbol;

  const page = pagination.success ? pagination.data.page : 1;
  const pageSize = pagination.success ? pagination.data.pageSize : 20;
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select()
    .from(news)
    .orderBy(desc(news.createdAt))
    .limit(pageSize)
    .offset(offset);

  const articles = rows.map(row => ({
    id: row.id,
    tick: row.tick,
    headline: row.headline,
    content: row.content,
    category: row.category,
    sentiment: parseFloat(row.sentiment || '0'),
    symbols: row.symbols?.split(',').filter(Boolean) || [],
    createdAt: row.createdAt,
  }));

  return c.json({
    success: true,
    data: {
      items: articles,
      page,
      pageSize,
      hasMore: rows.length === pageSize,
    },
  });
});

/**
 * GET /news/:id - Get news article by ID
 */
newsRouter.get('/:id', async (c) => {
  const { id } = c.req.param();

  const [article] = await db
    .select()
    .from(news)
    .where(eq(news.id, id));

  if (!article) {
    return c.json(
      {
        success: false,
        error: 'Article not found',
      },
      404
    );
  }

  return c.json({
    success: true,
    data: {
      id: article.id,
      tick: article.tick,
      headline: article.headline,
      content: article.content,
      category: article.category,
      sentiment: parseFloat(article.sentiment || '0'),
      symbols: article.symbols?.split(',').filter(Boolean) || [],
      agentIds: article.agentIds?.split(',').filter(Boolean) || [],
      createdAt: article.createdAt,
    },
  });
});

export { newsRouter };
