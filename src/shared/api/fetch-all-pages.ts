/**
 * PostgREST returns at most `max_rows` (1000) rows per request, silently
 * cutting longer lists. Reads a whole list by fetching page after page; the
 * query must have a stable total order, or rows can repeat or go missing
 * between pages.
 */
export const PAGE_SIZE = 1000

interface PageResult<Row> {
  data: Row[] | null
  error: { message: string } | null
}

export async function fetchAllPages<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row>>,
): Promise<{ data: Row[]; error: null } | { data: null; error: Error }> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error !== null) return { data: null, error: new Error(error.message) }
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
