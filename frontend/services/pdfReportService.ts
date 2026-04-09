/**
 * PDF Report Service for Clubvel App
 * Generates PDF reports for Treasurer Reports screen
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface ContributionData {
  member_name: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  payment_date?: string;
}

export interface ClubSummary {
  id: string;
  name: string;
  member_count: number;
  collected: number;
  expected: number;
  late_count: number;
}

export interface ReportData {
  reportType: 'monthly' | 'quarterly' | 'annual' | 'member';
  treasurerName: string;
  generatedDate: string;
  period: string;
  clubs: ClubSummary[];
  contributions?: ContributionData[];
  summary: {
    totalCollected: number;
    totalExpected: number;
    collectionRate: number;
    totalMembers: number;
    latePayments: number;
  };
}

// Format currency in South African Rand
const formatCurrency = (amount: number): string => {
  return `R${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

// Generate HTML template for PDF
const generateReportHTML = (data: ReportData): string => {
  const clubRows = data.clubs.map(club => `
    <tr>
      <td>${club.name}</td>
      <td style="text-align: center;">${club.member_count}</td>
      <td style="text-align: right;">${formatCurrency(club.collected)}</td>
      <td style="text-align: right;">${formatCurrency(club.expected)}</td>
      <td style="text-align: center;">${club.late_count}</td>
      <td style="text-align: right;">${((club.collected / club.expected) * 100).toFixed(1)}%</td>
    </tr>
  `).join('');

  const contributionRows = data.contributions ? data.contributions.map(c => `
    <tr>
      <td>${c.member_name}</td>
      <td style="text-align: center;">
        <span class="status-${c.status.toLowerCase()}">${c.status}</span>
      </td>
      <td style="text-align: right;">${formatCurrency(c.amount_due)}</td>
      <td style="text-align: right;">${formatCurrency(c.amount_paid)}</td>
      <td style="text-align: center;">${c.payment_date || '-'}</td>
    </tr>
  `).join('') : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Clubvel Report</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          font-size: 12px;
          color: #333;
          padding: 20px;
          background: #fff;
        }
        .header {
          text-align: center;
          padding-bottom: 20px;
          border-bottom: 2px solid #0E2318;
          margin-bottom: 20px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #0E2318;
          margin-bottom: 5px;
        }
        .logo-accent {
          color: #C8880A;
        }
        .subtitle {
          font-size: 14px;
          color: #666;
        }
        .report-title {
          font-size: 20px;
          color: #0E2318;
          margin: 20px 0 10px 0;
          text-transform: uppercase;
        }
        .report-meta {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          font-size: 11px;
          color: #666;
        }
        .summary-cards {
          display: flex;
          gap: 15px;
          margin-bottom: 25px;
        }
        .summary-card {
          flex: 1;
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          text-align: center;
        }
        .summary-card.highlight {
          background: #0E2318;
          color: #fff;
        }
        .summary-card.highlight .card-value {
          color: #C8880A;
        }
        .card-label {
          font-size: 10px;
          text-transform: uppercase;
          color: #888;
          margin-bottom: 5px;
        }
        .summary-card.highlight .card-label {
          color: #aaa;
        }
        .card-value {
          font-size: 18px;
          font-weight: bold;
          color: #0E2318;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        th {
          background: #0E2318;
          color: #fff;
          padding: 10px 8px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
        }
        td {
          padding: 10px 8px;
          border-bottom: 1px solid #e0e0e0;
          font-size: 11px;
        }
        tr:nth-child(even) {
          background: #f8f9fa;
        }
        .status-confirmed, .status-paid {
          color: #28a745;
          font-weight: bold;
        }
        .status-pending {
          color: #ffc107;
          font-weight: bold;
        }
        .status-late, .status-overdue {
          color: #dc3545;
          font-weight: bold;
        }
        .section-title {
          font-size: 14px;
          color: #0E2318;
          margin: 20px 0 10px 0;
          padding-bottom: 5px;
          border-bottom: 1px solid #C8880A;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e0e0e0;
          text-align: center;
          font-size: 10px;
          color: #888;
        }
        .watermark {
          position: fixed;
          bottom: 20px;
          right: 20px;
          font-size: 8px;
          color: #ccc;
        }
        @media print {
          body { padding: 0; }
          .summary-cards { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">Club<span class="logo-accent">vel</span></div>
        <div class="subtitle">Stokvel Management Platform</div>
      </div>

      <div class="report-title">${data.reportType.charAt(0).toUpperCase() + data.reportType.slice(1)} Financial Report</div>
      
      <div class="report-meta">
        <div>
          <strong>Treasurer:</strong> ${data.treasurerName}<br>
          <strong>Period:</strong> ${data.period}
        </div>
        <div style="text-align: right;">
          <strong>Generated:</strong> ${data.generatedDate}<br>
          <strong>Report ID:</strong> RPT-${Date.now().toString(36).toUpperCase()}
        </div>
      </div>

      <div class="summary-cards">
        <div class="summary-card highlight">
          <div class="card-label">Total Collected</div>
          <div class="card-value">${formatCurrency(data.summary.totalCollected)}</div>
        </div>
        <div class="summary-card">
          <div class="card-label">Expected</div>
          <div class="card-value">${formatCurrency(data.summary.totalExpected)}</div>
        </div>
        <div class="summary-card">
          <div class="card-label">Collection Rate</div>
          <div class="card-value">${data.summary.collectionRate.toFixed(1)}%</div>
        </div>
        <div class="summary-card">
          <div class="card-label">Late Payments</div>
          <div class="card-value" style="color: ${data.summary.latePayments > 0 ? '#dc3545' : '#28a745'};">
            ${data.summary.latePayments}
          </div>
        </div>
      </div>

      <div class="section-title">Club Summary</div>
      <table>
        <thead>
          <tr>
            <th>Club Name</th>
            <th style="text-align: center;">Members</th>
            <th style="text-align: right;">Collected</th>
            <th style="text-align: right;">Expected</th>
            <th style="text-align: center;">Late</th>
            <th style="text-align: right;">Rate</th>
          </tr>
        </thead>
        <tbody>
          ${clubRows}
        </tbody>
      </table>

      ${data.contributions && data.contributions.length > 0 ? `
        <div class="section-title">Member Contributions</div>
        <table>
          <thead>
            <tr>
              <th>Member Name</th>
              <th style="text-align: center;">Status</th>
              <th style="text-align: right;">Due</th>
              <th style="text-align: right;">Paid</th>
              <th style="text-align: center;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${contributionRows}
          </tbody>
        </table>
      ` : ''}

      <div class="footer">
        This report was automatically generated by Clubvel.<br>
        For questions, contact your stokvel administrator.
      </div>

      <div class="watermark">
        Clubvel © ${new Date().getFullYear()}
      </div>
    </body>
    </html>
  `;
};

// Generate and share PDF report
export const generatePDFReport = async (data: ReportData): Promise<{ success: boolean; message: string; uri?: string }> => {
  try {
    const html = generateReportHTML(data);
    
    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Create a more descriptive filename
    const filename = `Clubvel_${data.reportType}_Report_${data.period.replace(/\s/g, '_')}.pdf`;
    const newUri = `${FileSystem.documentDirectory}${filename}`;

    // Move to documents directory with proper name
    await FileSystem.moveAsync({
      from: uri,
      to: newUri,
    });

    return {
      success: true,
      message: 'Report generated successfully',
      uri: newUri,
    };
  } catch (error) {
    console.error('PDF generation error:', error);
    return {
      success: false,
      message: `Failed to generate PDF: ${error}`,
    };
  }
};

// Share generated PDF
export const sharePDFReport = async (uri: string): Promise<{ success: boolean; message: string }> => {
  try {
    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    
    if (!isAvailable) {
      return {
        success: false,
        message: 'Sharing is not available on this device',
      };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Clubvel Report',
      UTI: 'com.adobe.pdf',
    });

    return {
      success: true,
      message: 'Report shared successfully',
    };
  } catch (error) {
    console.error('Sharing error:', error);
    return {
      success: false,
      message: `Failed to share PDF: ${error}`,
    };
  }
};

// Print PDF directly
export const printPDFReport = async (data: ReportData): Promise<{ success: boolean; message: string }> => {
  try {
    const html = generateReportHTML(data);
    
    await Print.printAsync({
      html,
    });

    return {
      success: true,
      message: 'Print dialog opened',
    };
  } catch (error) {
    console.error('Print error:', error);
    return {
      success: false,
      message: `Failed to print: ${error}`,
    };
  }
};

// Generate sample report data for testing
export const generateSampleReportData = (treasurerName: string): ReportData => {
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  return {
    reportType: 'monthly',
    treasurerName,
    generatedDate: now.toLocaleDateString('en-ZA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    period: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
    clubs: [
      {
        id: 'group1',
        name: 'Soshanguve Savings Club',
        member_count: 12,
        collected: 5500,
        expected: 6000,
        late_count: 1,
      },
      {
        id: 'group2',
        name: 'Mamelodi Burial Society',
        member_count: 8,
        collected: 2400,
        expected: 2400,
        late_count: 0,
      },
    ],
    contributions: [
      { member_name: 'Thabo Mokoena', status: 'Confirmed', amount_due: 500, amount_paid: 500, payment_date: '2026-04-03' },
      { member_name: 'Lerato Nkosi', status: 'Late', amount_due: 500, amount_paid: 0 },
      { member_name: 'Sipho Dlamini', status: 'Confirmed', amount_due: 500, amount_paid: 500, payment_date: '2026-04-01' },
      { member_name: 'Nomsa Zulu', status: 'Pending', amount_due: 500, amount_paid: 0 },
    ],
    summary: {
      totalCollected: 7900,
      totalExpected: 8400,
      collectionRate: 94.0,
      totalMembers: 20,
      latePayments: 1,
    },
  };
};
