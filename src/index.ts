#!/usr/bin/env npx ts-node

import express from 'express';
import { Request, Response } from 'express';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import apiBuilder from '@codeaim/api-builder';

const app = express();
const port = 5001;

app.use(express.json());

function createResource(
    resource: string,
    httpHandlers: apiBuilder.HttpHandler<any, any>[],
    routes: apiBuilder.Route<any, any>[],
) {
  const updatedResource = resource.replace(/\{(.*?)}/g, ':$1');

  httpHandlers.forEach(({ httpMethod }) => {
    app[httpMethod.toLowerCase()](
        updatedResource,
        async (req: Request, res: Response) => {
          const api = await import(`${process.argv[2]}?update=${Date.now()}`);
          const event = ({
            resource: resource,
            httpMethod: httpMethod.toUpperCase(),
            headers: req.headers as APIGatewayProxyEvent['headers'],
            body: req.body,
            path: req.path,
            pathParameters: req.params,
            queryStringParameters: req.query,
            requestContext: {
                authorizer: { claims: req.headers.claims ?? { email: "admin@gitboard.io", admin: true }} as any
            },
            multiValueQueryStringParameters: Object.keys(req.query).reduce(
              (acc, key) => ({
                ...acc,
                [key]: Array.isArray(req.query[key])
                  ? req.query[key]
                  : [req.query[key]],
              }),
              {},
            )
          } as APIGatewayProxyEvent)
          const response = await api.handler(event) as APIGatewayProxyResult;
          res
              .status(response.statusCode)
              .set(response.headers)
              .json(JSON.parse(response.body));
        },
    );
    console.log(`${httpMethod} http://localhost:${port}${updatedResource}`);
  });
  routes.forEach(({ resource: nestedResource, httpHandlers, routes }) =>
      createResource(`${resource}${nestedResource}`, httpHandlers, routes),
  );
}

const routes = (await import(`${process.argv[2]}?update=${Date.now()}`))
    .api
    .apiRoutes()

    routes.forEach(({ resource, httpHandlers, routes }) =>
        createResource(resource, httpHandlers, routes),
    );

app.listen(port);
