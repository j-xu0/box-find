// @ts-nocheck -- Bun executes this JavaScript test; Svelte's TypeScript config does not include Bun types.
import { afterEach, describe, expect, test } from 'bun:test';
import { handle } from '../src/hooks.server.ts';

const originalEnvironment = process.env.ENVIRONMENT;

afterEach(() => {
	if (originalEnvironment === undefined) {
		delete process.env.ENVIRONMENT;
	} else {
		process.env.ENVIRONMENT = originalEnvironment;
	}
});

const mutationRoutes = [
	['PATCH', '/api/delImage'],
	['DELETE', '/api/deleteBox'],
	['POST', '/api/import'],
	['POST', '/api/newBox'],
	['PATCH', '/api/renameBox'],
	['PATCH', '/api/saveContent'],
	['PATCH', '/api/saveImage']
];

const runHandle = (method, pathname, resolve) =>
	handle({
		event: {
			request: new Request(`http://localhost${pathname}`, { method }),
			url: new URL(`http://localhost${pathname}`)
		},
		resolve
	});

describe('demo-mode API guard', () => {
	for (const [method, pathname] of mutationRoutes) {
		test(`blocks ${method} ${pathname} before its database handler runs`, async () => {
			process.env.ENVIRONMENT = 'DEMO';
			let handlerRan = false;
			const response = await runHandle(method, pathname, () => {
				handlerRan = true;
				return new Response(null, { status: 204 });
			});

			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				error: 'This action is not allowed in demo mode'
			});
			expect(handlerRan).toBe(false);
		});
	}

	test('allows read-only API requests in demo mode', async () => {
		process.env.ENVIRONMENT = 'DEMO';
		let handlerRan = false;
		const response = await runHandle('GET', '/api/export', () => {
			handlerRan = true;
			return new Response(null, { status: 204 });
		});

		expect(response.status).toBe(204);
		expect(handlerRan).toBe(true);
	});

	test('allows mutations outside demo mode', async () => {
		process.env.ENVIRONMENT = 'PRODUCTION';
		let handlerRan = false;
		const response = await runHandle('POST', '/api/newBox', () => {
			handlerRan = true;
			return new Response(null, { status: 201 });
		});

		expect(response.status).toBe(201);
		expect(handlerRan).toBe(true);
	});
});
