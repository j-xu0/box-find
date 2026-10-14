import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

function client() {
	if (!env.PHOTO_ENDPOINT || !env.PHOTO_ACCESS_KEY || !env.PHOTO_SECRET_KEY) {
		throw new Error('Garage photo storage is not configured');
	}
	return new S3Client({
		endpoint: env.PHOTO_ENDPOINT,
		region: 'garage',
		forcePathStyle: true,
		credentials: { accessKeyId: env.PHOTO_ACCESS_KEY, secretAccessKey: env.PHOTO_SECRET_KEY },
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED'
	});
}

export async function storePhoto(bytes: Buffer): Promise<string> {
	const key = `${createHash('sha256').update(bytes).digest('hex')}.jpg`;
	await client().send(
		new PutObjectCommand({ Bucket: 'photos', Key: key, Body: bytes, ContentType: 'image/jpeg' })
	);
	return `/photos/${key}`;
}

export async function readPhoto(key: string) {
	return client().send(new GetObjectCommand({ Bucket: 'photos', Key: key }));
}
