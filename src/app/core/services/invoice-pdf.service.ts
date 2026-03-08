import { Injectable, inject } from '@angular/core';
import jsPDF from 'jspdf';
import { InvoiceBusinessSnapshot, InvoiceRecord } from '../models';
import { formatDateRange } from '../utils/date.utils';
import { toCurrency } from '../utils/money.utils';
import { AppI18nService } from './app-i18n.service';

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  private readonly i18n = inject(AppI18nService);

  buildInvoicePdf(invoice: InvoiceRecord, businessSnapshot: InvoiceBusinessSnapshot): Blob {
    const document = new jsPDF({
      unit: 'pt',
      format: 'letter'
    });
    const locale = this.i18n.currentLocale();

    const pageWidth = document.internal.pageSize.getWidth();
    const margin = 48;
    const rightColumn = pageWidth - margin;
    let cursorY = 56;

    document.setFont('helvetica', 'bold');
    document.setFontSize(24);
    document.text(businessSnapshot.businessName || 'JobLedger Contractor', margin, cursorY);

    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    cursorY += 18;

    const businessLines = [
      businessSnapshot.contactEmail,
      businessSnapshot.phone,
      businessSnapshot.mailingAddress?.line1,
      businessSnapshot.mailingAddress?.line2,
      businessSnapshot.mailingAddress
        ? `${businessSnapshot.mailingAddress.city}, ${businessSnapshot.mailingAddress.state} ${businessSnapshot.mailingAddress.postalCode}`
        : undefined
    ].filter(Boolean) as string[];

    for (const line of businessLines) {
      document.text(line, margin, cursorY);
      cursorY += 14;
    }

    document.setFont('helvetica', 'bold');
    document.setFontSize(14);
    document.text(this.i18n.instant('history.kinds.invoice'), rightColumn, 56, { align: 'right' });
    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    document.text(`${this.i18n.instant('pdf.invoiceNumber')}: ${invoice.invoiceNumber}`, rightColumn, 76, {
      align: 'right'
    });
    document.text(
      `${this.i18n.instant('common.status')}: ${this.i18n.instant(`invoiceStatus.${invoice.status}`)}`,
      rightColumn,
      92,
      { align: 'right' }
    );
    document.text(
      `${this.i18n.instant('pdf.jobDates')}: ${formatDateRange(invoice.jobSnapshot.startDate, invoice.jobSnapshot.endDate, locale)}`,
      rightColumn,
      108,
      { align: 'right' }
    );

    cursorY = Math.max(cursorY, 150);
    document.setDrawColor(190, 197, 211);
    document.line(margin, cursorY, rightColumn, cursorY);
    cursorY += 28;

    document.setFont('helvetica', 'bold');
    document.text(this.i18n.instant('pdf.billTo'), margin, cursorY);
    document.setFont('helvetica', 'normal');
    cursorY += 16;

    const billingLines = [
      invoice.clientSnapshot.displayName,
      invoice.clientSnapshot.companyName,
      invoice.clientSnapshot.billingEmail,
      invoice.clientSnapshot.phone,
      invoice.clientSnapshot.billingAddress?.line1,
      invoice.clientSnapshot.billingAddress?.line2,
      invoice.clientSnapshot.billingAddress
        ? `${invoice.clientSnapshot.billingAddress.city}, ${invoice.clientSnapshot.billingAddress.state} ${invoice.clientSnapshot.billingAddress.postalCode}`
        : undefined
    ].filter(Boolean) as string[];

    for (const line of billingLines) {
      document.text(line, margin, cursorY);
      cursorY += 14;
    }

    cursorY += 10;
    document.setFont('helvetica', 'bold');
    document.text(this.i18n.instant('common.job'), margin, cursorY);
    document.setFont('helvetica', 'normal');
    cursorY += 16;
    document.text(invoice.jobSnapshot.title, margin, cursorY);
    cursorY += 14;

    if (invoice.jobSnapshot.address) {
      document.text(invoice.jobSnapshot.address.line1, margin, cursorY);
      cursorY += 14;

      if (invoice.jobSnapshot.address.line2) {
        document.text(invoice.jobSnapshot.address.line2, margin, cursorY);
        cursorY += 14;
      }

      document.text(
        `${invoice.jobSnapshot.address.city}, ${invoice.jobSnapshot.address.state} ${invoice.jobSnapshot.address.postalCode}`,
        margin,
        cursorY
      );
      cursorY += 14;
    }

    if (invoice.jobSnapshot.description) {
      cursorY += 8;
      const lines = document.splitTextToSize(invoice.jobSnapshot.description, pageWidth - margin * 2);
      document.text(lines, margin, cursorY);
      cursorY += lines.length * 14;
    }

    cursorY += 18;
    this.drawTableHeader(document, margin, rightColumn, cursorY);
    cursorY += 20;

    for (const lineItem of invoice.lineItems) {
      if (cursorY > 700) {
        document.addPage();
        cursorY = 56;
        this.drawTableHeader(document, margin, rightColumn, cursorY);
        cursorY += 20;
      }

      document.setFont('helvetica', 'normal');
      document.text(lineItem.description, margin, cursorY);
      document.text(lineItem.unitLabel, margin + 270, cursorY);
      document.text(String(lineItem.quantity), margin + 360, cursorY, { align: 'right' });
      document.text(toCurrency(lineItem.unitPriceCents), margin + 450, cursorY, { align: 'right' });
      document.text(toCurrency(lineItem.totalCents), rightColumn, cursorY, { align: 'right' });
      cursorY += 18;
    }

    cursorY += 12;
    document.line(margin, cursorY, rightColumn, cursorY);
    cursorY += 22;
    document.setFont('helvetica', 'bold');
    document.text(this.i18n.instant('common.subtotal'), rightColumn - 88, cursorY, { align: 'right' });
    document.text(toCurrency(invoice.subtotalCents), rightColumn, cursorY, { align: 'right' });

    return document.output('blob');
  }

  triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private drawTableHeader(document: jsPDF, margin: number, rightColumn: number, y: number): void {
    document.setFont('helvetica', 'bold');
    document.text(this.i18n.instant('common.description'), margin, y);
    document.text(this.i18n.instant('pdf.unitShort'), margin + 270, y);
    document.text(this.i18n.instant('pdf.qtyShort'), margin + 360, y, { align: 'right' });
    document.text(this.i18n.instant('pdf.rateShort'), margin + 450, y, { align: 'right' });
    document.text(this.i18n.instant('pdf.amountShort'), rightColumn, y, { align: 'right' });
  }
}
