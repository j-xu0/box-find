export const DEMO_MODE_ERROR = 'This action is not allowed in demo mode';

export const isDemoMode = (environment = process.env.ENVIRONMENT) => environment === 'DEMO';
