import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { GroupReport, generateReportHTML } from './reports';

// Generate and share PDF report
export const generatePDFReport = async (data: GroupReport): Promise<{ success: boolean; message: string; uri?: string }> => {
  try {
    const html = generateReportHTML(data);
    
    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    return {
      success: true,
      message: 'Report generated successfully',
      uri: uri,
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
      message: 'Share dialog closed; sending is controlled by you',
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
export const printPDFReport = async (data: GroupReport): Promise<{ success: boolean; message: string }> => {
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
