import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
				miniflare: {
					bindings: {
						__VITEST_POOL_WORKERS_USER_OBJECT: {
							className: "ServiceRegistry",
							scriptName: "__VITEST_POOL_WORKERS_USER_WORKER__",
						},
					},
				},
			},
		},
		coverage: {
			provider: "istanbul",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/**",
				"**/*.test.ts",
				"**/*.d.ts",
				"vitest.config.ts",
				"worker-configuration.d.ts",
			],
		},
	},
});