// @ts-nocheck -- Opt in only against an isolated app and Garage instance; see README.
import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const base = process.env.BACKUP_TEST_URL;
const integration = base ? test : test.skip;

integration(
	'HTTP backup restores photos after both box records and Garage objects are removed',
	async () => {
		const id = `backup-test-${crypto.randomUUID()}`;
		const other = `${id}-shared`;
		const api = async (path, method, body) => {
			const options = {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			};
			const response = await fetch(`${base}/api/${path}`, options);
			return { response, body: await response.json() };
		};
		const s3 = new S3Client({
			endpoint: process.env.PHOTO_ENDPOINT ?? 'http://127.0.0.1:3900',
			region: 'garage',
			forcePathStyle: true,
			credentials: {
				accessKeyId: process.env.PHOTO_ACCESS_KEY ?? 'GK11111111111111111111111111111111',
				secretAccessKey:
					process.env.PHOTO_SECRET_KEY ??
					'2222222222222222222222222222222222222222222222222222222222222222'
			}
		});
		try {
			const photo = await sharp({
				create: { width: 10, height: 10, channels: 3, background: `#${id.slice(-6)}` }
			})
				.png()
				.toBuffer();
			const inline = `data:image/png;base64,${photo.toString('base64')}`;
			for (const boxId of [id, other]) {
				expect((await api('newBox', 'POST', { id: boxId })).response.status).toBe(201);
			}
			const saved = await api('saveImage', 'PATCH', { id, base64: inline });
			expect(saved.response.status).toBe(200);
			const image = saved.body.image;
			expect((await api('saveImage', 'PATCH', { id: other, base64: inline })).body.image).toBe(
				image
			);
			const original = Buffer.from(await (await fetch(`${base}${image}`)).arrayBuffer());
			const exported = await fetch(`${base}/api/export`);
			expect(exported.status).toBe(200);
			expect(exported.headers.get('content-type')).toBe('application/zip');
			const archive = await exported.arrayBuffer();
			const importZip = () =>
				fetch(`${base}/api/import`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/zip' },
					body: archive
				});
			expect((await importZip()).status).toBe(409);
			await s3.send(
				new DeleteObjectCommand({ Bucket: 'photos', Key: image.slice('/photos/'.length) })
			);
			expect((await fetch(`${base}${image}`, { cache: 'no-store' })).status).toBe(404);
			// A missing Garage object must also prevent a successful but incomplete export.
			expect((await fetch(`${base}/api/export`)).status).toBe(503);
			expect(
				(await api('import', 'POST', { importObj: [{ id, contents: '', images: [image] }] }))
					.response.status
			).toBe(400);
			for (const boxId of [id, other]) await api('deleteBox', 'DELETE', { id: boxId });
			const restored = await importZip();
			expect(restored.status).toBe(200);
			expect((await restored.json()).imported).toEqual(expect.arrayContaining([id, other]));
			const restoredPhoto = await fetch(`${base}${image}`, { cache: 'no-store' });
			expect(restoredPhoto.status).toBe(200);
			expect(Buffer.from(await restoredPhoto.arrayBuffer()).equals(original)).toBe(true);
			const search = await (
				await fetch(`${base}/api/search/1?query=${encodeURIComponent(id)}`)
			).json();
			expect(search.find((result) => result.item.id === id).item.images).toEqual([image]);
			const legacyId = `${id}-legacy`;
			const legacy = await api('import', 'POST', {
				importObj: [{ id: legacyId, contents: '', images: [inline] }]
			});
			expect(legacy.response.status).toBe(200);
			await api('deleteBox', 'DELETE', { id: legacyId });
			expect(
				(
					await fetch(`${base}/api/import`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/zip' },
						body: 'invalid'
					})
				).status
			).toBe(400);
		} finally {
			for (const boxId of [id, other, `${id}-legacy`])
				await api('deleteBox', 'DELETE', { id: boxId });
			s3.destroy();
		}
	},
	30_000
);
