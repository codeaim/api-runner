#!/usr/bin/env npx tsx

import express from 'express';
import cors from 'cors';
import { Request, Response } from 'express';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import apiBuilder from '@codeaim/api-builder';

const app = express();
const port = process.env.API_PORT ?? 5001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

function extractCognitoClaims(req: Request) {
  const includeClaims = process.env.API_INCLUDE_COGNITO_CLAIMS;
  if (includeClaims && req.headers['authorization']) {
    const token = req.headers['authorization'].substring(7);
    const decoded = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString(),
    );
    return {
      ...decoded,
      'cognito:groups': decoded['cognito:groups']?.join(','),
    };
  }
  return {};
}
function createResource(
  method: string,
  path: string,
  handler: (event:  APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
) {
  const updatedPath = path.replace(/\{(.*?)}/g, ':$1');

    app[method.toLowerCase()](
      updatedPath,
      async (req: Request, res: Response) => {
        const { api } = await import(`${process.argv[2]}?update=${Date.now()}`);
        const event = {
          resource: updatedPath,
          httpMethod: method.toUpperCase(),
          headers: req.headers as APIGatewayProxyEvent['headers'],
          body: JSON.stringify(
            req.is('application/x-www-form-urlencoded')
              ? JSON.parse(Object.keys(req.body)[0])
              : req.body,
          ),
          path: req.path,
          pathParameters: Object.keys(req.params).reduce(
            (acc, key) => ({
              ...acc,
              [key]: encodeURIComponent(req.params[key]),
            }),
            {},
          ),
          queryStringParameters: req.query,
          requestContext: {
            authorizer: { claims: extractCognitoClaims(req) } as any,
          },
          multiValueQueryStringParameters: Object.keys(req.query).reduce(
            (acc, key) => ({
              ...acc,
              [key]: Array.isArray(req.query[key])
                ? req.query[key]
                : [req.query[key]],
            }),
            {},
          ),
        } as APIGatewayProxyEvent;
        const response = (await api.handler(event)) as APIGatewayProxyResult;
        res
          .status(response.statusCode)
          .set(response.headers)
          .json(JSON.parse(response.body));
      },
    );
    console.log(`${method} http://localhost:${port}${updatedPath}`);
}

const routes = (
  await import(`${process.argv[2]}?update=${Date.now()}`)
).api.routes;

routes.forEach(({ method, path, handler }) =>
  createResource(method, path, handler),
);

app.listen(port);
