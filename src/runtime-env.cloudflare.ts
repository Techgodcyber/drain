import { env } from 'cloudflare:workers';

export const getAlchemyApiKey = () => env.ALCHEMY_API_KEY;
