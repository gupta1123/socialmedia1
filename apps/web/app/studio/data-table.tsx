"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  align?: "start" | "end";
};

export type DataTableFilter<T> = {
  id: string;
  label: string;
  options: Array<{ label: string; value: string }>;
  getValue: (row: T) => string | null | undefined;
  defaultValue?: string;
};

type DataTableProps<T> = {
  rows: T[];
  columns: Array<DataTableColumn<T>>;
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  search?: {
    placeholder: string;
    getText: (row: T) => string;
  };
  filters?: Array<DataTableFilter<T>>;
  defaultSort?: {
    columnId: string;
    direction: "asc" | "desc";
  };
  pageSizeOptions?: number[];
  initialPageSize?: number;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: ReactNode;
  resultLabel?: (showing: number, total: number) => string;
  toolbarPrefix?: ReactNode;
};

const defaultPageSizes = [10, 20, 50];

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  search,
  filters = [],
  defaultSort,
  pageSizeOptions = defaultPageSizes,
  initialPageSize = pageSizeOptions[0] ?? 10,
  emptyTitle,
  emptyBody,
  emptyAction,
  resultLabel,
  toolbarPrefix
}: DataTableProps<T>) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const [sortColumnId, setSortColumnId] = useState(defaultSort?.columnId ?? null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(defaultSort?.direction ?? "asc");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((filter) => [filter.id, filter.defaultValue ?? "all"]))
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (search && searchTerm.trim().length > 0) {
        const haystack = search.getText(row).toLowerCase();
        if (!haystack.includes(searchTerm.trim().toLowerCase())) {
          return false;
        }
      }

      for (const filter of filters) {
        const selected = filterValues[filter.id] ?? "all";
        if (selected === "all") continue;
        if ((filter.getValue(row) ?? "") !== selected) {
          return false;
        }
      }

      return true;
    });
  }, [filterValues, filters, rows, search, searchTerm]);

  const sortedRows = useMemo(() => {
    if (!sortColumnId) {
      return filteredRows;
    }

    const column = columns.find((item) => item.id === sortColumnId);
    if (!column?.sortValue) {
      return filteredRows;
    }

    return [...filteredRows].sort((left, right) => {
      const leftValue = column.sortValue?.(left);
      const rightValue = column.sortValue?.(right);

      const leftComparable = leftValue ?? "";
      const rightComparable = rightValue ?? "";

      if (typeof leftComparable === "number" && typeof rightComparable === "number") {
        return sortDirection === "asc" ? leftComparable - rightComparable : rightComparable - leftComparable;
      }

      const comparison = String(leftComparable).localeCompare(String(rightComparable), undefined, {
        numeric: true,
        sensitivity: "base"
      });

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [columns, filteredRows, sortColumnId, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterValues, pageSize, sortColumnId, sortDirection]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedRows]);

  const total = sortedRows.length;
  const showingStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingEnd = total === 0 ? 0 : Math.min(currentPage * pageSize, total);

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) {
      return;
    }

    if (sortColumnId === column.id) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumnId(column.id);
    setSortDirection("asc");
  }

  function handleRowNavigate(row: T, event?: React.KeyboardEvent<HTMLTableRowElement> | React.MouseEvent<HTMLTableRowElement>) {
    const href = rowHref?.(row);
    if (!href) {
      return;
    }

    if (event && "target" in event) {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, select, textarea")) {
        return;
      }
    }

    router.push(href);
  }

  return (
    <div className="data-table-shell">
      {(search || filters.length > 0 || toolbarPrefix) ? (
        <div className="data-table-toolbar">
          <div className="data-table-toolbar-left">
            {toolbarPrefix}
          </div>
          <div className="data-table-toolbar-right">
            {search ? (
              <label className="data-table-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={search.placeholder}
                  type="search"
                  value={searchTerm}
                />
              </label>
            ) : null}

            <div className="data-table-filters">
              {filters.map((filter) => (
                <label className="data-table-filter" key={filter.id}>
                  <span>{filter.label}</span>
                  <select
                    onChange={(event) =>
                      setFilterValues((current) => ({ ...current, [filter.id]: event.target.value }))
                    }
                    value={filterValues[filter.id] ?? "all"}
                  >
                    <option value="all">All</option>
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {(searchTerm || Object.values(filterValues).some(v => v !== "all")) && (
              <button 
                className="button button-ghost table-action-button"
                onClick={() => {
                  setSearchTerm("");
                  setFilterValues(Object.fromEntries(filters.map(f => [f.id, "all"])));
                }}
                style={{ border: 0, height: "32px", fontSize: "0.78rem" }}
               type="button"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      ) : null}

      {total > 0 ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      className={`${column.className ?? ""} ${column.align === "end" ? "is-end" : ""}`.trim()}
                      key={column.id}
                      scope="col"
                    >
                      {column.sortValue ? (
                        <button className="data-table-sort" onClick={() => toggleSort(column)} type="button">
                          <span>{column.header}</span>
                          <span className={`data-table-sort-indicator ${sortColumnId === column.id ? "is-active" : ""}`.trim()}>
                            {sortColumnId === column.id ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        <span className="data-table-header-label">{column.header}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <tr
                      className={href ? "is-clickable" : ""}
                      key={rowKey(row)}
                      onClick={(event) => handleRowNavigate(row, event)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleRowNavigate(row, event);
                        }
                      }}
                      role={href ? "link" : undefined}
                      tabIndex={href ? 0 : undefined}
                    >
                      {columns.map((column) => (
                        <td
                          className={`${column.className ?? ""} ${column.align === "end" ? "is-end" : ""}`.trim()}
                          key={column.id}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="data-table-footer">
              <p className="data-table-summary">
                {showingStart}-{showingEnd} of {total}
              </p>
              <div className="data-table-footer-controls">
                <label className="data-table-page-size">
                  <span>Rows</span>
                  <select onChange={(event) => setPageSize(Number(event.target.value))} value={pageSize}>
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="data-table-pagination">
                  <button
                    className="button button-ghost table-action-button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    type="button"
                  >
                    Prev
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className="button button-ghost table-action-button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state empty-state-tall">
          <strong>{emptyTitle}</strong>
          <p>{emptyBody}</p>
          {emptyAction}
        </div>
      )}
    </div>
  );
}
