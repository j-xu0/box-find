import sharp from 'sharp';
import { MAX_PHOTO_BYTES } from '../photos';

export class PhotoError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}

const MAX_PIXELS = 25_000_000;
let active = 0;

export function decodePhoto(value: unknown): Buffer {
	if (typeof value !== 'string') throw new PhotoError('Provide an inline image');
	if (value.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 100) {
		throw new PhotoError('Photos must be 10 MiB or smaller', 413);
	}
	const match = /^data:image\/(?:png|jpeg|jpg|webp|gif|tiff);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
		value
	);
	if (!match || match[1].length % 4 !== 0) throw new PhotoError('Invalid image data');
	const bytes = Buffer.from(match[1], 'base64');
	if (!bytes.length || bytes.toString('base64') !== match[1])
		throw new PhotoError('Invalid image data');
	if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError('Photos must be 10 MiB or smaller', 413);
	return bytes;
}

export async function processPhoto(value: unknown): Promise<string> {
	// Reject excess work instead of holding an unbounded queue of decoded uploads in memory.
	if (active >= 2) throw new PhotoError('Photo processing is busy. Try saving again.', 503);
	active++;
	try {
		const bytes = decodePhoto(value);
		let original: Buffer;
		try {
			original = await sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: false })
				.rotate()
				.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 82 })
				.toBuffer();
		} catch {
			throw new PhotoError('Image could not be decoded (maximum 25 megapixels)');
		}
		return `data:image/jpeg;base64,${original.toString('base64')}`;
	} finally {
		active--;
	}
}
