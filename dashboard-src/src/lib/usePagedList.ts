import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 24;

/* Client-side paging over an already-filtered list: the page count follows the
   list, and the page itself is clamped when filtering shrinks the list under the
   visitor (searching while on the last page must not leave an empty view). */
export function usePagedList<Item>(items: Item[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return { page, setPage, pageCount, visibleItems };
}

/* Case-insensitive "any of these fields contains the search text", the filter
   both the event and source lists offer above their paged results. */
export function filterByText<Item>(
  items: Item[],
  search: string,
  fieldsOf: (item: Item) => Array<string | null | undefined>,
): Item[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => fieldsOf(item).some((value) => value?.toLowerCase().includes(needle)));
}
