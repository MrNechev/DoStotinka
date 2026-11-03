import { existsSync } from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config';
import type { Database } from './db';
import { HttpError } from './lib/errors';
import { registerAuth, requireAuth } from './plugins/auth';
import { accountRoutes } from './routes/accounts';
import { authRoutes } from './routes/auth';
import { budgetRoutes } from './routes/budgets';
import { categoryRoutes } from './routes/categories';
import { currencyRoutes } from './routes/currencies';
import { exportRoutes } from './routes/export';
import { importRoutes } from './routes/import';
import { labelRoutes } from './routes/labels';
import { meRoutes } from './routes/me';
import { metaRoutes } from './routes/meta';
import { plannedRoutes } from './routes/planned';
import { recordRoutes } from './routes/records';
import { statsRoutes } from './routes/stats';

export async function buildApp(config: Config, db: Database) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            transport: undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    // Fastify accepts a hop count too, but its typings only list boolean | string.
    trustProxy: config.TRUST_PROXY as boolean | string,
    bodyLimit: 5 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  app.decorate('config', config);

  app.setErrorHandler((error: FastifyError | HttpError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => ({
        path: (v.instancePath || '').replace(/^\//, '').replace(/\//g, '.'),
        message: v.message ?? 'Invalid value',
      }));
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: issues[0]
          ? `${issues[0].path ? `${issues[0].path}: ` : ''}${issues[0].message}`
          : 'Invalid request',
        issues,
      });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      });
    }
    const status = (error as FastifyError).statusCode ?? 500;
    if (status >= 500) req.log.error({ err: error }, 'Unhandled error');
    return reply.status(status).send({
      statusCode: status,
      error: status >= 500 ? 'Internal Server Error' : error.name,
      message: status >= 500 ? 'Something went wrong' : error.message,
    });
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    // The app is frequently served over plain HTTP on a LAN.
    strictTransportSecurity: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  if (config.API_DOCS) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Slavotax API',
          description:
            'REST API of Slavotax. Authenticate with the session cookie or an `Authorization: Bearer <token>` header (obtain a token via `POST /api/auth/login` with `issueToken: true`). Amounts are integers in minor units (cents).',
          version: config.version,
        },
        components: {
          securitySchemes: {
            bearer: { type: 'http', scheme: 'bearer' },
            cookie: { type: 'apiKey', in: 'cookie', name: 'slavotax_session' },
          },
        },
        security: [{ bearer: [] }, { cookie: [] }],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, {
      routePrefix: '/api/docs',
      staticCSP: false,
      transformStaticCSP: (header) => header,
    });
  }

  registerAuth(app, db, config);

  await app.register(
    async (api) => {
      await api.register(metaRoutes);
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(async (authed) => {
        authed.addHook('preHandler', requireAuth);
        await authed.register(meRoutes, { prefix: '/me' });
        await authed.register(accountRoutes, { prefix: '/accounts' });
        await authed.register(categoryRoutes, { prefix: '/categories' });
        await authed.register(labelRoutes, { prefix: '/labels' });
        await authed.register(recordRoutes, { prefix: '/records' });
        await authed.register(plannedRoutes, { prefix: '/planned-payments' });
        await authed.register(budgetRoutes, { prefix: '/budgets' });
        await authed.register(statsRoutes, { prefix: '/stats' });
        await authed.register(currencyRoutes, { prefix: '/currencies' });
        await authed.register(exportRoutes, { prefix: '/export' });
        await authed.register(importRoutes, { prefix: '/import' });
      });
    },
    { prefix: '/api' },
  );

  // Serve the single page web app.
  const webDist = config.WEB_DIST ? path.resolve(config.WEB_DIST) : null;
  if (webDist && existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('cache-control', 'public, max-age=31536000, immutable');
        } else {
          res.header('cache-control', 'no-cache');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
      }
      return reply
        .status(404)
        .send({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) =>
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Route not found' }),
    );
  }

  return app;
}
