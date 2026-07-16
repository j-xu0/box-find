// @ts-nocheck -- Bun executes this JavaScript test; TypeScript checks the imported source.
import { describe, expect, test } from 'bun:test';
import { saveBoxChanges } from '../src/lib/save-workflow.ts';

const jsonResponse = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

describe('saveBoxChanges', () => {
	test('reports a successful save and empties completed image queues', async () => {
		const requests = [];
		const fetch = async (endpoint, options) => {
			requests.push([endpoint, JSON.parse(options.body)]);
			return jsonResponse({ status: 'ok' });
		};

		const result = await saveBoxChanges({
			id: 'garage',
			contents: 'tools',
			contentsChanged: true,
			newPhotos: ['new-image'],
			delPhotos: ['old-image'],
			fetch
		});

		expect(result).toMatchObject({
			outcome: 'success',
			attempted: 3,
			succeeded: 3,
			contentsSaved: true,
			remainingUploads: [],
			remainingDeletions: [],
			failures: []
		});
		expect(requests.map(([endpoint]) => endpoint).sort()).toEqual([
			'/api/delImage',
			'/api/saveContent',
			'/api/saveImage'
		]);
	});

	test('reports total failure with server and network error details', async () => {
		const fetch = async (endpoint) => {
			if (endpoint === '/api/saveContent') {
				return jsonResponse({ error: 'Box not found' }, 404);
			}
			throw new Error('connection lost');
		};

		const result = await saveBoxChanges({
			id: 'missing',
			contents: '',
			contentsChanged: true,
			newPhotos: ['new-image'],
			delPhotos: [],
			fetch
		});

		expect(result.outcome).toBe('failure');
		expect(result.succeeded).toBe(0);
		expect(result.contentsSaved).toBe(false);
		expect(result.remainingUploads).toEqual(['new-image']);
		expect(result.failures.map(({ message }) => message)).toEqual([
			'404: Box not found',
			'connection lost'
		]);
	});

	test('reports partial success and retains only failed operations for retry', async () => {
		const fetch = async (endpoint, options) => {
			const { base64 } = JSON.parse(options.body);
			if (endpoint === '/api/saveImage' && base64 === 'bad-upload') {
				return jsonResponse({ details: 'invalid image' }, 500);
			}
			if (endpoint === '/api/delImage' && base64 === 'bad-delete') {
				return new Response('storage unavailable', { status: 503 });
			}
			return jsonResponse({ status: 'ok' });
		};

		const result = await saveBoxChanges({
			id: 'garage',
			contents: 'unchanged',
			contentsChanged: false,
			newPhotos: ['good-upload', 'bad-upload'],
			delPhotos: ['bad-delete', 'good-delete'],
			fetch
		});

		expect(result.outcome).toBe('partial');
		expect(result.succeeded).toBe(2);
		expect(result.remainingUploads).toEqual(['bad-upload']);
		expect(result.remainingDeletions).toEqual(['bad-delete']);
		expect(result.failures.map(({ message }) => message)).toEqual([
			'500: invalid image',
			'503: storage unavailable'
		]);
	});

	test('does not issue a request for a no-op save', async () => {
		let requestCount = 0;
		const result = await saveBoxChanges({
			id: 'garage',
			contents: 'unchanged',
			contentsChanged: false,
			newPhotos: [],
			delPhotos: [],
			fetch: async () => {
				requestCount += 1;
				return jsonResponse({ status: 'ok' });
			}
		});

		expect(result.outcome).toBe('noop');
		expect(result.attempted).toBe(0);
		expect(requestCount).toBe(0);
	});
});
