/**
 * Utility functions for the app.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function downloadAndOpenFile(url: string, filename: string): Promise<void> {
  try {
    const fileUri = (FileSystem.cacheDirectory ?? '') + filename;

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      fileUri,
      {},
      (downloadProgress) => {
        // Can track progress here if needed
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result) {
      throw new Error('Download failed - no result returned');
    }

    const { uri } = result;

    // Check if sharing is available
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'text/csv',
        dialogTitle: `Open ${filename}`,
      });
    } else {
      // Fallback: can't open without sharing on mobile
      throw new Error('File sharing is not available on this device');
    }
  } catch (error) {
    throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function getReportFilename(type: string, format: string, date: string): string {
  const sanitisedType = type.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `warmpulse-${sanitisedType}-${date}.${format}`;
}
