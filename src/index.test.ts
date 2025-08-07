import { describe, it, expect, beforeEach, vi } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { ServiceRegistry } from "./index";
import type { IServiceRegistry, RegisterServiceRequest, DiscoverServiceRequest, ListServicesRequest, HealthCheckRequest, ServiceInfo } from "./index";

// Helper function to extract service names from listServices result
const getServiceNames = (services: Array<[string, ServiceInfo]>): string[] => 
	services.map(([name]) => name).sort();

describe("ServiceRegistry", () => {
	let id: DurableObjectId;
	let stub: DurableObjectStub<ServiceRegistry>;

	beforeEach(async () => {
		const typedEnv = env as Env;
		id = typedEnv.SERVICE_REGISTRY.newUniqueId();
		stub = typedEnv.SERVICE_REGISTRY.get(id);
	});

	describe("registerService", () => {
		it("should register a new service", async () => {
			const request: RegisterServiceRequest = {
				name: "test-service",
				url: "http://localhost:8080",
				metadata: { version: "1.0" }
			};

			const result = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.registerService(request);
			});

			expect(result).toEqual({
				success: true,
				serviceId: "test-service"
			});

			// Verify the service was stored
			const storedService = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.discoverService({ name: "test-service" });
			});

			expect(storedService).toMatchObject({
				url: "http://localhost:8080",
				metadata: { version: "1.0" },
				healthy: true
			});
			expect(storedService?.registeredAt).toBeDefined();
		});

		it("should register service with empty metadata", async () => {
			const request: RegisterServiceRequest = {
				name: "test-service",
				url: "http://localhost:8080"
			};

			const result = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.registerService(request);
			});

			expect(result).toEqual({
				success: true,
				serviceId: "test-service"
			});

			const storedService = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.discoverService({ name: "test-service" });
			});

			expect(storedService?.metadata).toEqual({});
		});
	});

	describe("unregisterService", () => {
		it("should unregister an existing service", async () => {
			await stub.registerService({
				name: "test-service",
				url: "http://localhost:8080"
			});

			const result = await stub.unregisterService("test-service");

			expect(result).toEqual({ success: true });
			expect(await stub.discoverService({ name: "test-service" })).toBeNull();
		});

		it("should return success even for non-existent service", async () => {
			const result = await stub.unregisterService("non-existent");
			expect(result).toEqual({ success: true });
		});
	});

	describe("discoverService", () => {
		it("should discover an existing service", async () => {
			await stub.registerService({
				name: "test-service",
				url: "http://localhost:8080",
				metadata: { version: "1.0" }
			});

			const result = await stub.discoverService({ name: "test-service" });

			expect(result).toMatchObject({
				url: "http://localhost:8080",
				metadata: { version: "1.0" },
				healthy: true
			});
		});

		it("should return null for non-existent service", async () => {
			const result = await stub.discoverService({ name: "non-existent" });
			expect(result).toBeNull();
		});
	});

	describe("listServices", () => {
		beforeEach(async () => {
			await stub.registerService({
				name: "service-a",
				url: "http://localhost:8080"
			});
			await stub.registerService({
				name: "service-b",
				url: "http://localhost:8081"
			});
			await stub.registerService({
				name: "api-service",
				url: "http://localhost:8082"
			});
		});

		it("should list all services", async () => {
			const result = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.listServices();
			});

			expect(result).toHaveLength(3);
			expect(getServiceNames(result)).toEqual([
				"api-service",
				"service-a",
				"service-b"
			]);
		});

		it("should list services with prefix", async () => {
			const result = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.listServices({ prefix: "service" });
			});

			expect(result).toHaveLength(2);
			expect(getServiceNames(result)).toEqual([
				"service-a",
				"service-b"
			]);
		});

		it("should return empty array when no services match", async () => {
			const result = await runInDurableObject(stub, async (instance: ServiceRegistry) => {
				return await instance.listServices({ prefix: "nonexistent" });
			});
			
			expect(result).toEqual([]);
		});
	});

	describe("updateHealthStatus", () => {
		beforeEach(() => {
			globalThis.fetch = vi.fn();
		});

		it("should update health status to healthy", async () => {
			await stub.registerService({
				name: "test-service",
				url: "http://localhost:8080"
			});

			vi.mocked(globalThis.fetch).mockResolvedValueOnce({
				ok: true
			} as Response);

			const result = await stub.updateHealthStatus({ name: "test-service" });

			expect(result).toEqual({ success: true });
			expect(globalThis.fetch).toHaveBeenCalledWith(
				"http://localhost:8080/health",
				expect.objectContaining({
					method: "GET",
					signal: expect.any(AbortSignal)
				})
			);

			const service = await stub.discoverService({ name: "test-service" });
			expect(service?.healthy).toBe(true);
			expect(service?.lastHealthCheck).toBeDefined();
		});

		it("should update health status to unhealthy on error", async () => {
			await stub.registerService({
				name: "test-service",
				url: "http://localhost:8080"
			});

			vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network error"));

			const result = await stub.updateHealthStatus({ name: "test-service" });

			expect(result).toEqual({ success: true });

			const service = await stub.discoverService({ name: "test-service" });
			expect(service?.healthy).toBe(false);
			expect(service?.lastHealthCheck).toBeDefined();
		});

		it("should return false for non-existent service", async () => {
			const result = await stub.updateHealthStatus({ name: "non-existent" });
			expect(result).toEqual({ success: false });
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});
	});
});