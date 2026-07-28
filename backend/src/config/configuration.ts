export default () => ({
  port: parseInt(process.env.PORT || '9091', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/p2p_platform',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    prefix: process.env.REDIS_PREFIX || 'p2p:',
    ttl: parseInt(process.env.REDIS_DEFAULT_TTL || '300', 10),
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@p2p.local',
    password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    name: process.env.ADMIN_NAME || 'Super Admin',
  },
  investor: {
    email: process.env.INVESTOR_EMAIL || 'investor@gmail.com',
    password: process.env.INVESTOR_PASSWORD || 'Test@123',
    name: process.env.INVESTOR_NAME || 'Demo Investor',
  },
  app: {
    name: process.env.APP_NAME || 'P2P Payment Platform',
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    webhookSecret: process.env.WEBHOOK_SECRET || 'webhook-signing-secret',
    userAppUrl: process.env.USER_APP_URL || 'http://localhost:5174',
    corsOrigins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  exchange: {
    /** INR per 1 USDT — used when partner wallet is USDT but payout is UPI/Bank */
    usdtInrRate: parseFloat(process.env.USDT_INR_RATE || '90'),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  storage: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.AWS_S3_ENDPOINT,
    bucket:
      process.env.NODE_ENV === 'production'
        ? process.env.AWS_S3_BUCKET_PROD || process.env.AWS_S3_BUCKET
        : process.env.AWS_S3_BUCKET_DEV || process.env.AWS_S3_BUCKET,
    baseUrl: process.env.AWS_S3_BASE_URL,
  },
});
