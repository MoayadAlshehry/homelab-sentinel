import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender
} from '@tanstack/react-table';
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export default function DataTable({
  data,
  columns,
  searchPlaceholder = 'Filter records...',
  initialSearch = '',
  onRowClick,
  bulkActions
}) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState(initialSearch);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);

  React.useEffect(() => {
    if (initialSearch) {
      setGlobalFilter(initialSearch);
    }
  }, [initialSearch]);

  const table = useReactTable({
    data,
    columns,
    autoResetPageIndex: false,
    getRowId: (row) => row.mac || row.name || row.id,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      rowSelection,
      pagination
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  return (
    <div className="space-y-4 w-full max-w-full">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 sm:py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00C853] transition-colors min-h-[44px] sm:min-h-0"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {selectedRows.length > 0 && bulkActions && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{selectedRows.length} selected</span>
              {bulkActions(selectedRows)}
            </div>
          )}

          {/* Column Visibility Dropdown */}
          <div className="relative ml-auto sm:ml-0">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="px-3.5 py-2.5 sm:py-2 bg-[#161B22] border border-[#2A3341] hover:border-gray-500 rounded-xl text-xs font-semibold text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#00C853]" />
              Columns
            </button>

            {showColumnDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1D2430] border border-[#2A3341] rounded-xl shadow-2xl z-40 p-2 space-y-1">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 border-b border-[#2A3341]">
                  Toggle Columns
                </div>
                {table.getAllLeafColumns().map((column) => {
                  if (column.id === 'select' || column.id === 'actions') return null;
                  return (
                    <label
                      key={column.id}
                      className="flex items-center gap-2 px-2 py-2 sm:py-1.5 rounded-lg hover:bg-[#2A3341] cursor-pointer text-xs text-gray-300 capitalize min-h-[36px]"
                    >
                      <input
                        type="checkbox"
                        checked={column.getIsVisible()}
                        onChange={column.getToggleVisibilityHandler()}
                        className="accent-[#00C853] rounded"
                      />
                      <span>{column.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Shell */}
      <div className="rounded-xl border border-[#2A3341] overflow-hidden bg-[#1D2430] shadow-xl w-full max-w-full">
        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto w-full scrollbar-thin scrollbar-thumb-gray-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#161B22] border-b border-[#2A3341] text-gray-400 uppercase tracking-wider font-bold">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const isSorted = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        className="py-3.5 px-4 font-bold select-none whitespace-nowrap"
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={`flex items-center gap-1.5 ${
                              canSort ? 'cursor-pointer hover:text-white transition-colors' : ''
                            }`}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && (
                              <span className="text-gray-500">
                                {isSorted === 'asc' ? (
                                  <ArrowUp className="w-3.5 h-3.5 text-[#00C853]" />
                                ) : isSorted === 'desc' ? (
                                  <ArrowDown className="w-3.5 h-3.5 text-[#00C853]" />
                                ) : (
                                  <ArrowUpDown className="w-3.5 h-3.5" />
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody className="divide-y divide-[#2A3341]/60 font-medium text-gray-200">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-10 text-gray-400">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick && onRowClick(row.original)}
                    className={`hover:bg-[#2A3341]/50 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${row.getIsSelected() ? 'bg-[#00C853]/10' : ''}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Small Screens Mobile Card-Based Fallback View (< md) */}
        <div className="md:hidden p-3 space-y-3">
          {table.getRowModel().rows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs bg-[#161B22] border border-[#2A3341] rounded-xl">
              No matching records found.
            </div>
          ) : (
            table.getRowModel().rows.map((row) => {
              const visibleCells = row.getVisibleCells();
              const selectCell = visibleCells.find((c) => c.column.id === 'select');
              const actionsCell = visibleCells.find((c) => c.column.id === 'actions');
              const dataCells = visibleCells.filter(
                (c) => c.column.id !== 'select' && c.column.id !== 'actions'
              );
              const primaryCell = dataCells[0];
              const secondaryCell = dataCells[1];
              const remainingCells = dataCells.slice(2);

              return (
                <div
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={`p-4 rounded-xl border border-[#2A3341] bg-[#161B22] shadow-md space-y-3 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-[#2A3341]/40' : ''
                  } ${row.getIsSelected() ? 'border-[#00C853]/50 bg-[#00C853]/5' : ''}`}
                >
                  {/* Header Row: Checkbox + Primary Title + Secondary Badge */}
                  <div className="flex items-center justify-between gap-2 border-b border-[#2A3341]/60 pb-2.5">
                    <div className="flex items-center gap-2.5 font-bold text-white text-xs min-w-0">
                      {selectCell && (
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0 min-h-[32px] flex items-center">
                          {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                        </div>
                      )}
                      {primaryCell && (
                        <div className="truncate">
                          {flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
                        </div>
                      )}
                    </div>

                    {secondaryCell && (
                      <div className="shrink-0">
                        {flexRender(secondaryCell.column.columnDef.cell, secondaryCell.getContext())}
                      </div>
                    )}
                  </div>

                  {/* Body: Stacked Label / Value Pairs */}
                  {remainingCells.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 text-xs pt-1">
                      {remainingCells.map((cell) => {
                        const headerTitle =
                          typeof cell.column.columnDef.header === 'string'
                            ? cell.column.columnDef.header
                            : cell.column.id;
                        return (
                          <div
                            key={cell.id}
                            className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-[#1D2430]/60 border border-[#2A3341]/40 min-h-[36px]"
                          >
                            <span className="text-gray-400 font-bold uppercase text-[10px] tracking-wider shrink-0">
                              {headerTitle}:
                            </span>
                            <div className="text-right text-gray-200 font-medium truncate">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions Footer */}
                  {actionsCell && (
                    <div className="pt-2 border-t border-[#2A3341]/60 flex items-center justify-end gap-2">
                      {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Footer Controls */}
        <div className="bg-[#161B22] border-t border-[#2A3341] py-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5">
              <span>Rows:</span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="bg-[#1D2430] border border-[#2A3341] text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#00C853] min-h-[36px] sm:min-h-0"
              >
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-gray-400 text-right sm:text-left">
              {table.getFilteredRowModel().rows.length} records
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
            <span className="font-medium text-gray-300">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="p-2 sm:p-1.5 min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg border border-[#2A3341] bg-[#1D2430] hover:bg-[#2A3341] text-gray-300 disabled:opacity-30 disabled:hover:bg-[#1D2430] transition-colors"
                title="First Page"
              >
                <ChevronsLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-2 sm:p-1.5 min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg border border-[#2A3341] bg-[#1D2430] hover:bg-[#2A3341] text-gray-300 disabled:opacity-30 disabled:hover:bg-[#1D2430] transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-2 sm:p-1.5 min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg border border-[#2A3341] bg-[#1D2430] hover:bg-[#2A3341] text-gray-300 disabled:opacity-30 disabled:hover:bg-[#1D2430] transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="p-2 sm:p-1.5 min-w-[38px] min-h-[38px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg border border-[#2A3341] bg-[#1D2430] hover:bg-[#2A3341] text-gray-300 disabled:opacity-30 disabled:hover:bg-[#1D2430] transition-colors"
                title="Last Page"
              >
                <ChevronsRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
