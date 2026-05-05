import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

let sharingInProgress = false;

export async function shareCsvFile({
  fileName,
  csv,
  title,
}: {
  fileName: string;
  csv: string;
  title: string;
}) {
  if (sharingInProgress) {
    throw new Error('An export is already being prepared.');
  }

  sharingInProgress = true;
  let sharedFile: File | null = null;

  try {
    if (Platform.OS === 'web') {
      await Share.share({ title, message: csv });
      return;
    }

    const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '-');
    const file = new File(Paths.cache, safeFileName);
    sharedFile = file;
    file.create({ overwrite: true, intermediates: true });
    file.write(csv, { encoding: 'utf8' });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        dialogTitle: title,
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      });
      return;
    }

    await Share.share({ title, message: csv });
  } finally {
    try {
      sharedFile?.delete();
    } catch {
      // Best-effort cleanup; sharing failure should remain the primary outcome.
    }
    sharingInProgress = false;
  }
}
