import { describe, it, expect, beforeEach, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import worker from "./index";

describe("Service Discovery Worker", () => {
	let mockRegistry: any;
	const typedEnv = env as Env;
	
	beforeEach(() => {
		mockRegistry = {
			registerService: vi.fn(),
			unregisterService: vi.fn(),
			discoverService: vi.fn(),
			listServices: vi.fn(),
			updateHealthStatus: vi.fn(),
		};

		typedEnv.SERVICE_REGISTRY = {
			idFromName: vi.fn().mockReturnValue("test-id"),
			get: vi.fn().mockReturnValue(mockRegistry),
		} as any;
	});

	describe("POST /register", () => {
		it("should register a service", async () => {
			mockRegistry.registerService.mockResolvedValue({
				success: true,
				serviceId: "test-service"
			});

			const request = new Request("http://localhost/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "test-service",
					url: "http://localhost:8080",
					metadata: { version: "1.0" }
				})
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({
				success: true,
				serviceId: "test-service"
			});
			expect(mockRegistry.registerService).toHaveBeenCalledWith({
				name: "test-service",
				url: "http://localhost:8080",
				metadata: { version: "1.0" }
			});
		});
	});

	describe("POST /unregister", () => {
		it("should unregister a service", async () => {
			mockRegistry.unregisterService.mockResolvedValue({ success: true });

			const request = new Request("http://localhost/unregister", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test-service" })
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({ success: true });
			expect(mockRegistry.unregisterService).toHaveBeenCalledWith("test-service");
		});
	});

	describe("POST /discover", () => {
		it("should discover an existing service", async () => {
			const serviceInfo = {
				url: "http://localhost:8080",
				metadata: { version: "1.0" },
				registeredAt: Date.now(),
				healthy: true
			};
			mockRegistry.discoverService.mockResolvedValue(serviceInfo);

			const request = new Request("http://localhost/discover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test-service" })
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual(serviceInfo);
		});

		it("should return 404 for non-existent service", async () => {
			mockRegistry.discoverService.mockResolvedValue(null);

			const request = new Request("http://localhost/discover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "non-existent" })
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body).toEqual({ error: "Service not found" });
		});
	});

	describe("GET /services", () => {
		it("should list all services", async () => {
			const services = [
				["service-a", { url: "http://localhost:8080" }],
				["service-b", { url: "http://localhost:8081" }]
			];
			mockRegistry.listServices.mockResolvedValue(services);

			const request = new Request("http://localhost/services");

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({ services });
			expect(mockRegistry.listServices).toHaveBeenCalledWith({ prefix: undefined });
		});

		it("should list services with prefix", async () => {
			const services = [["api-service", { url: "http://localhost:8080" }]];
			mockRegistry.listServices.mockResolvedValue(services);

			const request = new Request("http://localhost/services?prefix=api");

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({ services });
			expect(mockRegistry.listServices).toHaveBeenCalledWith({ prefix: "api" });
		});
	});

	describe("POST /health-check", () => {
		it("should update health status", async () => {
			mockRegistry.updateHealthStatus.mockResolvedValue({ success: true });

			const request = new Request("http://localhost/health-check", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test-service" })
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({ success: true });
			expect(mockRegistry.updateHealthStatus).toHaveBeenCalledWith({ name: "test-service" });
		});
	});

	describe("POST /rpc", () => {
		beforeEach(() => {
			globalThis.fetch = vi.fn();
		});

		it("should proxy RPC calls to healthy services", async () => {
			const serviceInfo = {
				url: "http://localhost:8080",
				healthy: true
			};
			mockRegistry.discoverService.mockResolvedValue(serviceInfo);

			const rpcResponse = {
				jsonrpc: "2.0",
				result: { userId: 123 },
				id: "test-id"
			};
			vi.mocked(globalThis.fetch).mockResolvedValue({
				json: vi.fn().mockResolvedValue(rpcResponse)
			} as any);

			const request = new Request("http://localhost/rpc", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					service: "user-service",
					method: "getUser",
					params: [123]
				})
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual(rpcResponse);

			expect(globalThis.fetch).toHaveBeenCalledWith(
				"http://localhost:8080/rpc",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: expect.stringContaining('"method":"getUser"')
				})
			);
		});

		it("should return 503 for unhealthy service", async () => {
			const serviceInfo = {
				url: "http://localhost:8080",
				healthy: false
			};
			mockRegistry.discoverService.mockResolvedValue(serviceInfo);

			const request = new Request("http://localhost/rpc", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					service: "user-service",
					method: "getUser",
					params: [123]
				})
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(503);
			const body = await response.json();
			expect(body).toEqual({ error: "Service unhealthy" });
		});

		it("should return 404 for non-existent service", async () => {
			mockRegistry.discoverService.mockResolvedValue(null);

			const request = new Request("http://localhost/rpc", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					service: "non-existent",
					method: "getUser",
					params: [123]
				})
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body).toEqual({ error: "Service not found" });
		});
	});

	describe("Error handling", () => {
		it("should handle invalid JSON", async () => {
			const request = new Request("http://localhost/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "invalid json"
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body).toHaveProperty("error", "Internal server error");
		});

		it("should return 404 for unknown endpoints", async () => {
			const request = new Request("http://localhost/unknown");

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body).toEqual({ error: "Not found" });
		});

		it("should handle method not allowed", async () => {
			const request = new Request("http://localhost/register", {
				method: "GET"
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, typedEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);
		});
	});
});