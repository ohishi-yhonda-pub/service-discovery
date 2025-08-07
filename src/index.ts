import { DurableObject } from "cloudflare:workers";

export interface ServiceInfo {
	url: string;
	metadata: Record<string, any>;
	registeredAt: number;
	lastHealthCheck?: number;
	healthy?: boolean;
}

export interface RegisterServiceRequest {
	name: string;
	url: string;
	metadata?: Record<string, any>;
}

export interface DiscoverServiceRequest {
	name: string;
}

export interface ListServicesRequest {
	prefix?: string;
}

export interface HealthCheckRequest {
	name: string;
}

export interface IServiceRegistry {
	registerService(request: RegisterServiceRequest): Promise<{ success: boolean; serviceId: string }>;
	unregisterService(name: string): Promise<{ success: boolean }>;
	discoverService(request: DiscoverServiceRequest): Promise<ServiceInfo | null>;
	listServices(request?: ListServicesRequest): Promise<Array<[string, ServiceInfo]>>;
	updateHealthStatus(request: HealthCheckRequest): Promise<{ success: boolean }>;
}

export class ServiceRegistry extends DurableObject<Env> implements IServiceRegistry {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async registerService(request: RegisterServiceRequest): Promise<{ success: boolean; serviceId: string }> {
		const { name, url, metadata = {} } = request;
		const serviceInfo: ServiceInfo = {
			url,
			metadata,
			registeredAt: Date.now(),
			healthy: true
		};
		
		await this.ctx.storage.put(`service:${name}`, serviceInfo);
		return { success: true, serviceId: name };
	}

	async unregisterService(name: string): Promise<{ success: boolean }> {
		await this.ctx.storage.delete(`service:${name}`);
		return { success: true };
	}

	async discoverService(request: DiscoverServiceRequest): Promise<ServiceInfo | null> {
		const service = await this.ctx.storage.get<ServiceInfo>(`service:${request.name}`);
		return service || null;
	}

	async listServices(request: ListServicesRequest = {}): Promise<Array<[string, ServiceInfo]>> {
		const prefix = request.prefix ? `service:${request.prefix}` : 'service:';
		const services = await this.ctx.storage.list<ServiceInfo>({ prefix });
		return Array.from(services.entries()).map(([key, value]) => [
			key.replace('service:', ''),
			value
		]);
	}

	async updateHealthStatus(request: HealthCheckRequest): Promise<{ success: boolean }> {
		const { name } = request;
		const service = await this.ctx.storage.get<ServiceInfo>(`service:${name}`);
		
		if (!service) {
			return { success: false };
		}

		try {
			const response = await fetch(`${service.url}/health`, {
				method: 'GET',
				signal: AbortSignal.timeout(5000)
			});
			
			service.healthy = response.ok;
			service.lastHealthCheck = Date.now();
			
			await this.ctx.storage.put(`service:${name}`, service);
			return { success: true };
		} catch (error) {
			service.healthy = false;
			service.lastHealthCheck = Date.now();
			
			await this.ctx.storage.put(`service:${name}`, service);
			return { success: true };
		}
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		const registryId = env.SERVICE_REGISTRY.idFromName("global");
		const registry = env.SERVICE_REGISTRY.get(registryId);

		try {
			if (path === "/register" && request.method === "POST") {
				const body = await request.json() as RegisterServiceRequest;
				const result = await registry.registerService(body);
				return Response.json(result);
			}

			if (path === "/unregister" && request.method === "POST") {
				const body = await request.json() as { name: string };
				const result = await registry.unregisterService(body.name);
				return Response.json(result);
			}

			if (path === "/discover" && request.method === "POST") {
				const body = await request.json() as DiscoverServiceRequest;
				const service = await registry.discoverService(body);
				
				if (!service) {
					return Response.json({ error: "Service not found" }, { status: 404 });
				}
				
				return Response.json(service);
			}

			if (path === "/services" && request.method === "GET") {
				const prefix = url.searchParams.get("prefix") || undefined;
				const services = await registry.listServices({ prefix });
				return Response.json({ services });
			}

			if (path === "/health-check" && request.method === "POST") {
				const body = await request.json() as HealthCheckRequest;
				const result = await registry.updateHealthStatus(body);
				return Response.json(result);
			}

			if (path === "/rpc" && request.method === "POST") {
				const body = await request.json() as {
					service: string;
					method: string;
					params: any[];
				};

				const service = await registry.discoverService({ name: body.service });
				
				if (!service || !service.healthy) {
					return Response.json({ 
						error: service ? "Service unhealthy" : "Service not found" 
					}, { status: service ? 503 : 404 });
				}

				const rpcRequest = {
					jsonrpc: "2.0",
					method: body.method,
					params: body.params,
					id: crypto.randomUUID()
				};

				const rpcResponse = await fetch(`${service.url}/rpc`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(rpcRequest)
				});

				const rpcResult = await rpcResponse.json();
				return Response.json(rpcResult);
			}

			return Response.json({ error: "Not found" }, { status: 404 });
		} catch (error) {
			return Response.json({ 
				error: "Internal server error", 
				/* istanbul ignore next */
				message: error instanceof Error ? error.message : /* istanbul ignore next */ "Unknown error" 
			}, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
