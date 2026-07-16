declare namespace NodeJS {
	interface ProcessEnv {
		MONGO_URI: string;
		ENVIRONMENT?: string;
	}
}
