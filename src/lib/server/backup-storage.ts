import { MAX_PHOTO_BYTES } from '../photos';
import { BackupError, readBounded, streamChunks } from './backups';
import { readPhoto } from './photo-store';

export async function readBackupPhoto(key: string): Promise<Buffer> {
	const photo = await readPhoto(key);
	if (!photo.Body) throw new BackupError(`Photo ${key} is unavailable`, 503);
	return readBounded(streamChunks(photo.Body.transformToWebStream()), MAX_PHOTO_BYTES);
}
