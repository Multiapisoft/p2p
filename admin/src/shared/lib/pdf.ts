export type PdfFilter = { label: string; value: string };

function stampedName(name: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${name}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function cell(value: string | number | null | undefined) {
  const s = value == null ? '' : String(value);
  return s.length > 180 ? `${s.slice(0, 177)}…` : s;
}

export async function downloadPdfTable(opts: {
  filename: string;
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  filters?: PdfFilter[];
}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const landscape = opts.headers.length > 6;
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageW = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString();

  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(opts.title, 12, 11);

  let y = 26;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated ${generated}  ·  ${opts.rows.length} filtered row(s)`, 12, y);
  y += 6;

  const filters = (opts.filters || []).filter((f) => f.value);
  if (filters.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 118, 110);
    doc.text('Applied filters', 12, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const line = filters.map((f) => `${f.label}: ${f.value}`).join('   ·   ');
    const wrapped = doc.splitTextToSize(line, pageW - 24);
    doc.text(wrapped, 12, y);
    y += wrapped.length * 4 + 3;
  }

  autoTable(doc, {
    startY: y,
    head: [opts.headers],
    body: opts.rows.map((row) => row.map(cell)),
    styles: {
      fontSize: landscape ? 7 : 8,
      cellPadding: 2.2,
      overflow: 'linebreak',
      textColor: [15, 23, 42],
      lineColor: [204, 251, 241],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    margin: { left: 12, right: 12, bottom: 16 },
    didDrawPage: (data) => {
      const page = data.pageNumber;
      const count = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Page ${page} of ${count}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
    },
  });

  const file = opts.filename.toLowerCase().endsWith('.pdf')
    ? opts.filename
    : `${stampedName(opts.filename)}.pdf`;
  doc.save(file);
}
