import * as ExcelJS from 'exceljs';
import { applyExcelHeaderStyle } from './excel';

describe('applyExcelHeaderStyle', () => {
  it('применяет общий filter и визуальный contract первой строки', () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');
    worksheet.columns = [
      { header: 'Первая', key: 'first' },
      { header: 'Вторая', key: 'second' },
    ];

    applyExcelHeaderStyle(worksheet);

    expect(worksheet.autoFilter).toEqual({
      from: { row: 1, column: 1 },
      to: { row: 1, column: 2 },
    });
    expect(worksheet.getRow(1).font).toEqual(expect.objectContaining({
      bold: true,
      color: { argb: 'FFFFFFFF' },
    }));
    expect(worksheet.getRow(1).fill).toEqual(expect.objectContaining({
      fgColor: { argb: 'FF1F2937' },
    }));
  });
});
