import type { Worksheet } from 'exceljs';

export function applyExcelHeaderStyle(worksheet: Worksheet): void {
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length },
  };

  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}
